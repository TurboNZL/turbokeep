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

    val configured get() = serverUrl.isNotEmpty()
    val signedIn get() = configured && token.isNotEmpty()
}
