package app.turbokeep.android

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * What the widget lists: the items on your Home list (the ones with a checkbox), in your own order from the app unless the widget's settings say
 * otherwise. Reading and sorting here use no Android classes beyond org.json, so they are covered by a plain unit test.
 */
object WidgetData {
    class Item(val id: String, val title: String, val text: String, val due: LocalDate?, val createdAt: String, val position: Double, val pinned: Boolean, val percent: Double, val tags: List<String> = emptyList())

    /** What a one-note widget shows: the title and the text; `rows` is what it lists (the title, then the lines of the text) so a long note scrolls. */
    class NoteView(val id: String, val title: String, val text: String)
    class Row(val text: String, val isTitle: Boolean)

    val SORTS = listOf("manual" to "My order (like the app)", "newest" to "Newest first", "due" to "Due date", "title" to "A to Z")

    /** `requireOnList`: the tasks widget lists only what has a checkbox; a tag's widget lists what was sent to the tag (the server already chose, so nothing is left out) */
    fun parse(json: String, zone: ZoneId = ZoneId.systemDefault(), requireOnList: Boolean = true): List<Item> {
        val a = try { JSONArray(json) } catch (e: Exception) { return emptyList() }
        val out = ArrayList<Item>()
        for (i in 0 until a.length()) {
            val n = a.optJSONObject(i) ?: continue
            if (n.optBoolean("archived") || n.optBoolean("trashed") || (requireOnList && !n.optBoolean("onList", true))) continue
            val text = n.optString("text")
            val title = n.optString("title").trim().ifEmpty { text.trim().lineSequence().firstOrNull()?.take(80) ?: "" }.ifEmpty { "Untitled" }
            val due = n.optString("dueDate", "").ifEmpty { null }?.let { runCatching { Instant.parse(it).atZone(zone).toLocalDate() }.getOrNull() }
            out.add(Item(n.getString("id"), title, if (n.optString("title").isBlank()) text.lineSequence().drop(1).joinToString("\n").trim() else text.trim(),
                due, n.optString("createdAt"), n.optDouble("position", 0.0), n.optBoolean("pinned"), n.optDouble("percentDone", 0.0), tagsOf(n)))
        }
        return out
    }

    private fun tagsOf(n: JSONObject): List<String> {
        val a = n.optJSONArray("tags") ?: return emptyList()
        return (0 until a.length()).map { a.optString(it) }.filter { it.isNotBlank() }.map { it.substringAfterLast('.') }
    }

    /** pinned first, then the chosen order. "manual" keeps the server's order (which already is the app's: pinned first, then the dragged position) */
    fun sorted(items: List<Item>, sort: String): List<Item> {
        val pinned = compareByDescending<Item> { it.pinned }
        return when (sort) {
            "newest" -> items.sortedWith(pinned.thenByDescending { it.createdAt })
            "due" -> items.sortedWith(pinned.thenBy { it.due ?: LocalDate.MAX })
            "title" -> items.sortedWith(pinned.thenBy(String.CASE_INSENSITIVE_ORDER) { it.title })
            else -> items.sortedWith(pinned.thenBy { it.position })
        }
    }

    /** "Today", "Tomorrow", "Overdue 3 Oct", "Fri 16 Oct" (and a progress figure when there is some) */
    fun meta(item: Item, today: LocalDate = LocalDate.now()): Pair<String, Boolean> {
        val d = item.due
        val parts = ArrayList<String>()
        var overdue = false
        if (d != null) {
            overdue = d.isBefore(today)
            parts.add(when {
                d == today -> "Today"
                d == today.plusDays(1) -> "Tomorrow"
                d.isBefore(today) -> "Overdue " + d.format(DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH))
                else -> d.format(DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH))
            })
        }
        if (item.percent > 0.0) parts.add("${Math.round(item.percent * 100)}%")
        if (item.tags.isNotEmpty()) parts.add(item.tags.take(3).joinToString(" "))
        return parts.joinToString(" · ") to overdue
    }

    /** "" is the tasks widget; anything else is a tag's title */
    fun path(tag: String) = if (tag.isEmpty()) "/api/notes?list=1&excerpt=1" else "/api/notes?list=0&excerpt=1&tag=" + URLEncoder.encode(tag, "UTF-8")

    fun cached(ctx: Context, tag: String = ""): List<Item> { val p = ServerPrefs(ctx); return sorted(parse(p.cache(tag) ?: "[]", requireOnList = tag.isEmpty()), p.widgetSort) }

    /** was this list ever fetched? (a widget that never was asks once instead of showing an empty list) */
    fun known(ctx: Context, tag: String = "") = ServerPrefs(ctx).cache(tag) != null

    /** Asks the server for one list and keeps the answer. Blocking: call from a background thread. True when the server answered. */
    fun fetch(ctx: Context, tag: String = ""): Boolean {
        return try {
            val res = KeepApi.call(ctx, "GET", path(tag))
            if (res.ok) { ServerPrefs(ctx).setCache(tag, res.body); true } else false
        } catch (e: Exception) { false }
    }

    /** Takes one item out of every kept list (it was just finished or sent elsewhere), so the widget shows that at once, before the server has been asked again. */
    fun forget(ctx: Context, id: String) {
        val p = ServerPrefs(ctx)
        for (key in p.cacheKeys()) {
            val a = runCatching { JSONArray(p.cache(key) ?: "[]") }.getOrNull() ?: continue
            val kept = JSONArray()
            for (i in 0 until a.length()) { val o = a.optJSONObject(i); if (o != null && o.optString("id") != id) kept.put(o) }
            p.setCache(key, kept.toString())
        }
    }

    // ---- the one-note widget ----
    fun parseNote(json: String): NoteView? {
        val n = try { JSONObject(json) } catch (e: Exception) { return null }
        val id = n.optString("id").ifEmpty { return null }
        val text = n.optString("text").replace("\r\n", "\n")
        val title = n.optString("title").trim()
        return if (title.isNotEmpty()) NoteView(id, title, text.trim()) else NoteView(id, text.trim().lineSequence().firstOrNull()?.take(120)?.ifEmpty { null } ?: "Untitled", text.lineSequence().drop(1).joinToString("\n").trim())
    }

    /** the title, then the text line by line (a run of blank lines becomes one gap), so a long note is a list that scrolls */
    fun rows(n: NoteView): List<Row> {
        val out = ArrayList<Row>()
        out.add(Row(n.title, true))
        var gap = false
        for (line in n.text.lineSequence()) {
            if (line.isBlank()) { gap = out.size > 1; continue }
            if (gap) { out.add(Row(" ", false)); gap = false }
            out.add(Row(line.trimEnd(), false))
        }
        return out
    }

    fun cachedNote(ctx: Context, id: String): NoteView? = ServerPrefs(ctx).noteCache(id)?.let { parseNote(it) }

    fun fetchNote(ctx: Context, id: String): Boolean {
        return try {
            val res = KeepApi.call(ctx, "GET", "/api/notes/$id")
            if (res.ok) { ServerPrefs(ctx).setNoteCache(id, res.body); true } else false
        } catch (e: Exception) { false }
    }

    /** the notes a one-note widget can show: id and title, newest edit first. Null when the server could not be reached. */
    fun fetchChoices(ctx: Context): List<Pair<String, String>>? {
        return try {
            val res = KeepApi.call(ctx, "GET", "/api/notes?excerpt=1")
            if (!res.ok) return null
            val a = JSONArray(res.body)
            (0 until a.length()).mapNotNull { a.optJSONObject(it) }.sortedByDescending { it.optString("updatedAt") }
                .map { o -> o.optString("id") to (parseNote(o.toString())?.title ?: "Untitled") }
        } catch (e: Exception) { null }
    }

    /** the tags a list widget can show: the ones that hold notes. Null when the server could not be reached. */
    fun fetchTagTitles(ctx: Context): List<String>? {
        return try {
            val res = KeepApi.call(ctx, "GET", "/api/tags")
            if (!res.ok) return null
            val a = JSONArray(res.body)
            (0 until a.length()).mapNotNull { a.optJSONObject(it) }.filter { it.optInt("count") > 0 }.map { it.optString("title") }.filter { it.isNotEmpty() }
        } catch (e: Exception) { null }
    }
}
