package app.turbokeep.android

import android.content.Context

/**
 * What the native side (the widget, quick add, updates) needs to know. The server address is typed in SetupActivity; the token is made by the
 * web page after you sign in (it asks the server for an API token and hands it over through the bridge), so the widget can talk to the server
 * without the web page being open.
 */
class ServerPrefs(context: Context) {
    private val p = context.applicationContext.getSharedPreferences("turbokeep", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = p.getString("serverUrl", "") ?: ""
        set(v) { p.edit().putString("serverUrl", v.trim().trimEnd('/')).apply() }
    var token: String
        get() = p.getString("token", "") ?: ""
        set(v) { p.edit().putString("token", v.trim()).apply() }
    /** a Cloudflare Access service token (CF-Access-Client-Id / -Secret) for the widget, when the server sits behind Cloudflare Access; blank when none */
    var cfId: String
        get() = p.getString("cfId", "") ?: ""
        set(v) { p.edit().putString("cfId", v.trim()).apply() }
    var cfSecret: String
        get() = p.getString("cfSecret", "") ?: ""
        set(v) { p.edit().putString("cfSecret", v.trim()).apply() }
    /** a GitHub token with read access, only needed while the repository is private */
    var updateToken: String
        get() = p.getString("updateToken", "") ?: ""
        set(v) { p.edit().putString("updateToken", v.trim()).apply() }
    var lastUpdateCheck: Long
        get() = p.getLong("lastUpdateCheck", 0L)
        set(v) { p.edit().putLong("lastUpdateCheck", v).apply() }

    /** the widgets' look (shared by all of them): text size (1 = normal, down to 0.5), the space between items in dp (below 0 the items sit tighter than their normal padding), and the order ("manual" = the same order as in the app) */
    var widgetZoom: Float
        get() = p.getFloat("widgetZoom", 1f)
        set(v) { p.edit().putFloat("widgetZoom", v.coerceIn(0.5f, 2.0f)).apply() }
    var widgetSpacing: Int
        get() = p.getInt("widgetSpacing", 2)
        set(v) { p.edit().putInt("widgetSpacing", v.coerceIn(-10, 20)).apply() }
    var widgetSort: String
        get() = p.getString("widgetSort", "manual") ?: "manual"
        set(v) { p.edit().putString("widgetSort", v).apply() }
    /** the widget's open button shows the widget settings first (on by default); off: it opens the app straight away (the settings stay one long-press away: Reconfigure) */
    var openShowsSettings: Boolean
        get() = p.getBoolean("openShowsSettings", true)
        set(v) { p.edit().putBoolean("openShowsSettings", v).apply() }
    /** the size of the round buttons floating over the widgets' corners, in dp (Android 12 and later can resize them), and whether items show their tags (off by default) */
    var widgetButton: Int
        get() = p.getInt("widgetButton", 40)
        set(v) { p.edit().putInt("widgetButton", v.coerceIn(24, 56)).apply() }
    var widgetShowTags: Boolean
        get() = p.getBoolean("widgetShowTags", false)
        set(v) { p.edit().putBoolean("widgetShowTags", v).apply() }
    /** a refresh is running: the widgets show a spinner instead of the refresh arrow */
    var refreshing: Boolean
        get() = p.getBoolean("refreshing", false)
        set(v) { p.edit().putBoolean("refreshing", v).apply() }

    /** per list widget: which tag it shows ("" = your tasks) and the item it has opened up to fill the whole widget (blank when none) */
    fun widgetTag(id: Int): String = p.getString("widgetTag_$id", "") ?: ""
    fun setWidgetTag(id: Int, tag: String) { p.edit().putString("widgetTag_$id", tag).apply() }
    fun widgetOpen(id: Int): String = p.getString("widgetOpen_$id", "") ?: ""
    fun setWidgetOpen(id: Int, itemId: String) { p.edit().putString("widgetOpen_$id", itemId).apply() }
    /** the last list the server sent for a tag ("" = tasks): null until it was asked once. The widget draws from it at once (and while offline); a refresh only replaces it */
    fun cache(tag: String): String? = p.getString("widgetCache:$tag", null)
    fun setCache(tag: String, json: String) { p.edit().putString("widgetCache:$tag", json).apply() }
    fun cacheKeys(): List<String> = p.all.keys.filter { it.startsWith("widgetCache:") }.map { it.removePrefix("widgetCache:") }

    /** per one-note widget: which note it shows, and the last copy of that note */
    fun noteOf(id: Int): String = p.getString("noteWidget_$id", "") ?: ""
    fun setNoteOf(id: Int, noteId: String) { p.edit().putString("noteWidget_$id", noteId).apply() }
    fun noteCache(noteId: String): String? = p.getString("noteCache:$noteId", null)
    fun setNoteCache(noteId: String, json: String) { p.edit().putString("noteCache:$noteId", json).apply() }

    /** a widget was removed from the home screen */
    fun forgetWidget(id: Int) { p.edit().remove("widgetTag_$id").remove("widgetOpen_$id").remove("noteWidget_$id").apply() }

    val configured get() = serverUrl.isNotEmpty()
    val signedIn get() = configured && token.isNotEmpty()
}
