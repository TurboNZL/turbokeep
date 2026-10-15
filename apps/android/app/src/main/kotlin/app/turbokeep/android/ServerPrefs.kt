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

    /** the widget's look: text size (1 = normal), the space between items in dp, and the order ("manual" = the same order as in the app) */
    var widgetZoom: Float
        get() = p.getFloat("widgetZoom", 1f)
        set(v) { p.edit().putFloat("widgetZoom", v.coerceIn(0.8f, 1.8f)).apply() }
    var widgetSpacing: Int
        get() = p.getInt("widgetSpacing", 4)
        set(v) { p.edit().putInt("widgetSpacing", v.coerceIn(0, 20)).apply() }
    var widgetSort: String
        get() = p.getString("widgetSort", "manual") ?: "manual"
        set(v) { p.edit().putString("widgetSort", v).apply() }
    /** the item the widget has opened up a little (its description and the two big buttons are showing); blank when none */
    var widgetOpen: String
        get() = p.getString("widgetOpen", "") ?: ""
        set(v) { p.edit().putString("widgetOpen", v).apply() }
    /** the last list the server sent, so the widget draws at once (and while offline) and a refresh only has to replace it */
    var widgetCache: String
        get() = p.getString("widgetCache", "[]") ?: "[]"
        set(v) { p.edit().putString("widgetCache", v).apply() }

    val configured get() = serverUrl.isNotEmpty()
    val signedIn get() = configured && token.isNotEmpty()
}
