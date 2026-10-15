package app.turbokeep.android

import android.content.Context
import android.webkit.CookieManager
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/** The calls the native parts make to the server (the widget, quick add). Blocking: call from a background thread. */
object KeepApi {
    class Result(val code: Int, val body: String) { val ok get() = code in 200..299 }

    private val client = OkHttpClient.Builder().connectTimeout(10, TimeUnit.SECONDS).readTimeout(20, TimeUnit.SECONDS).build()
    private val JSON = "application/json; charset=utf-8".toMediaType()

    /**
     * Cloudflare Access (when the server is behind it) wants its own cookie, which the web view already holds after you signed in there; the service
     * token from the setup screen is the fallback once that cookie runs out. Only the CF_ cookies are forwarded, never the web page's session.
     */
    private fun accessCookie(url: String): String =
        (CookieManager.getInstance().getCookie(url) ?: "").split(";").map { it.trim() }.filter { it.startsWith("CF_") }.joinToString("; ")

    fun call(ctx: Context, method: String, path: String, json: String? = null): Result {
        val prefs = ServerPrefs(ctx)
        if (!prefs.signedIn) return Result(401, "Not signed in")
        val b = Request.Builder().url(prefs.serverUrl + path).header("Authorization", "Bearer ${prefs.token}").header("Accept", "application/json")
        if (prefs.cfId.isNotEmpty() && prefs.cfSecret.isNotEmpty()) b.header("CF-Access-Client-Id", prefs.cfId).header("CF-Access-Client-Secret", prefs.cfSecret)
        val cookie = accessCookie(prefs.serverUrl)
        if (cookie.isNotEmpty()) b.header("Cookie", cookie)
        val body = when {
            json != null -> json.toRequestBody(JSON)
            method == "POST" || method == "PUT" || method == "PATCH" -> "".toRequestBody(JSON)
            else -> null
        }
        b.method(method, body)
        client.newCall(b.build()).execute().use { r ->
            // a token the server no longer knows (revoked, or a new server): forget it, the web page makes a fresh one the next time it is opened
            if (r.code == 401) prefs.token = ""
            return Result(r.code, r.body?.string() ?: "")
        }
    }

    /** Is there a TurboKeep at this address? Used by the setup screen, before anything is saved. */
    fun health(url: String): String? {
        return try {
            val r = client.newCall(Request.Builder().url("$url/api/health").build()).execute()
            r.use { val t = it.body?.string() ?: ""; if (it.isSuccessful && t.contains("\"ok\":true")) t else null }
        } catch (e: Exception) { null }
    }
}
