package app.turbokeep.android

import android.content.Context
import org.json.JSONArray
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
    class Item(val id: String, val title: String, val text: String, val due: LocalDate?, val createdAt: String, val position: Double, val pinned: Boolean, val percent: Double)

    val SORTS = listOf("manual" to "My order (like the app)", "newest" to "Newest first", "due" to "Due date", "title" to "A to Z")

    fun parse(json: String, zone: ZoneId = ZoneId.systemDefault()): List<Item> {
        val a = try { JSONArray(json) } catch (e: Exception) { return emptyList() }
        val out = ArrayList<Item>()
        for (i in 0 until a.length()) {
            val n = a.optJSONObject(i) ?: continue
            if (n.optBoolean("archived") || n.optBoolean("trashed") || !n.optBoolean("onList", true)) continue
            val text = n.optString("text")
            val title = n.optString("title").trim().ifEmpty { text.trim().lineSequence().firstOrNull()?.take(80) ?: "" }.ifEmpty { "Untitled" }
            val due = n.optString("dueDate", "").ifEmpty { null }?.let { runCatching { Instant.parse(it).atZone(zone).toLocalDate() }.getOrNull() }
            out.add(Item(n.getString("id"), title, if (n.optString("title").isBlank()) text.lineSequence().drop(1).joinToString("\n").trim() else text.trim(),
                due, n.optString("createdAt"), n.optDouble("position", 0.0), n.optBoolean("pinned"), n.optDouble("percentDone", 0.0)))
        }
        return out
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
        return parts.joinToString(" · ") to overdue
    }

    fun cached(ctx: Context): List<Item> { val p = ServerPrefs(ctx); return sorted(parse(p.widgetCache), p.widgetSort) }

    /** Asks the server for the list and keeps the answer. Blocking: call from a background thread. True when the server answered. */
    fun fetch(ctx: Context): Boolean {
        return try {
            val res = KeepApi.call(ctx, "GET", "/api/notes?list=1&excerpt=1")
            if (res.ok) { ServerPrefs(ctx).widgetCache = res.body; true } else false
        } catch (e: Exception) { false }
    }

    /** Takes one item out of the kept list (it was just finished), so the widget shows that at once, before the server has been asked again. */
    fun forget(ctx: Context, id: String) {
        val p = ServerPrefs(ctx)
        val a = runCatching { JSONArray(p.widgetCache) }.getOrNull() ?: return
        val kept = JSONArray()
        for (i in 0 until a.length()) { val o = a.optJSONObject(i); if (o != null && o.optString("id") != id) kept.put(o) }
        p.widgetCache = kept.toString()
    }
}
