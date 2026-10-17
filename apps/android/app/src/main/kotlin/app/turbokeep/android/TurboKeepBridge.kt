package app.turbokeep.android

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Base64
import android.webkit.JavascriptInterface
import android.widget.Toast
import app.turbokeep.android.update.AppUpdater
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * What the web page can ask the app for, as `window.TurboKeepAndroid`: strings only, results as JSON (the engine's bridge rules).
 * The page uses it to hand over the API token the widget needs, to save exports into Downloads, and for the update card in Settings > This app.
 */
class TurboKeepBridge(private val context: Context, private val view: android.webkit.WebView) {
    private val prefs = ServerPrefs(context)
    private val main = Handler(Looper.getMainLooper())

    @JavascriptInterface fun info(): String = JSONObject()
        .put("version", BuildConfig.VERSION_NAME).put("serverUrl", prefs.serverUrl).put("hasToken", prefs.token.isNotEmpty())
        .put("hasUpdateToken", prefs.updateToken.isNotEmpty()).put("update", JSONObject(AppUpdater.state.json())).toString()

    /** The page tells the app which server it uses and how to sign in (TurboMusic's bridge does the same): the widget and quick add use the address and token, AccessProxy the address and the service token. */
    @JavascriptInterface fun setServer(url: String, token: String) { prefs.serverUrl = url; prefs.token = token; TasksWidgetProvider.refreshAll(context) }
    @JavascriptInterface fun setAccess(id: String, secret: String) { prefs.cfId = id; prefs.cfSecret = secret }
    /** this app adds the service token to the page's own GET requests for the server (AccessProxy), so images load without the page fetching them */
    @JavascriptInterface fun accessInjected(): Boolean = true
    /**
     * Requests with a body (sign-in, saving a note) done by the app instead of by the web view. The page is http://localhost and the server another origin, so
     * the web view would send a CORS preflight first, and Android's web view does not let the app answer a preflight (shouldInterceptRequest is not called
     * for it): it goes to Cloudflare Access without the service token and is refused unless that Access application has "Bypass options requests to origin".
     * Done here there is no preflight and no CORS at all, and the service token is added. Only the saved server may be asked. The answer comes back as the
     * `turbokeep-request` event ({id, status, body (base64), error}).
     */
    @JavascriptInterface fun request(id: String, method: String, url: String, headersJson: String, bodyBase64: String) {
        Thread {
            val reply = JSONObject().put("id", id)
            try {
                if (!AccessRoute.isServerRequest(prefs.serverUrl, url)) throw IllegalStateException("That is not the saved server. Press Save first.")
                val headers = JSONObject(headersJson)
                val contentType = headers.optString("Content-Type").ifEmpty { null }
                val b = Request.Builder().url(url)
                headers.keys().forEach { k -> if (k.lowercase() !in setOf("host", "origin", "referer", "cookie", "content-length")) b.header(k, headers.getString(k)) }
                prefs.accessHeaders().forEach { (k, v) -> b.header(k, v) }
                val m = method.uppercase()
                val body = when {
                    bodyBase64.isNotEmpty() -> Base64.decode(bodyBase64, Base64.DEFAULT).toRequestBody(contentType?.toMediaTypeOrNull())
                    m == "POST" || m == "PUT" || m == "PATCH" -> ByteArray(0).toRequestBody(contentType?.toMediaTypeOrNull())
                    else -> null
                }
                b.method(m, body)
                http.newCall(b.build()).execute().use { r ->
                    reply.put("status", r.code).put("body", Base64.encodeToString(r.body?.bytes() ?: ByteArray(0), Base64.NO_WRAP))
                }
            } catch (e: Exception) { reply.put("error", e.message ?: e.javaClass.simpleName) }
            view.post { view.evaluateJavascript("window.dispatchEvent(new CustomEvent('turbokeep-request',{detail:$reply}))", null) }
        }.start()
    }
    private val http = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(120, TimeUnit.SECONDS).build()

    @JavascriptInterface fun refreshWidgets() { TasksWidgetProvider.refreshAll(context) }
    /** Settings > This app > Android app: the widget's settings window, opened from the page (it has no widget to belong to, so it holds the shared choices: text size, spacing, buttons, order) */
    @JavascriptInterface fun openWidgetSettings() { main.post { context.startActivity(Intent(context, WidgetSettingsActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } }
    /** the window that chooses the note of a one-note widget, when the phone has one */
    @JavascriptInterface fun hasNoteWidget(): Boolean = NoteWidgetProvider.ids(context).isNotEmpty()

    @JavascriptInterface fun checkUpdate() { AppUpdater.check(context) }
    @JavascriptInterface fun installUpdate() { main.post { AppUpdater.install(context) } }
    @JavascriptInterface fun setUpdateToken(token: String) { prefs.updateToken = token }

    /** A blob download does not work in a web view, so the page hands the file over as base64 and it goes to the Downloads folder. */
    @JavascriptInterface fun saveFile(name: String, mime: String, base64: String): Boolean {
        return try {
            val safe = name.replace(Regex("[\\\\/:*?\"<>|]"), "_").ifEmpty { "turbokeep" }
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, safe); put(MediaStore.Downloads.MIME_TYPE, mime.ifEmpty { "application/octet-stream" }); put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return false
            resolver.openOutputStream(uri)?.use { it.write(Base64.decode(base64, Base64.DEFAULT)) } ?: return false
            values.clear(); values.put(MediaStore.Downloads.IS_PENDING, 0); resolver.update(uri, values, null, null)
            main.post { Toast.makeText(context, "Saved to Downloads: $safe", Toast.LENGTH_LONG).show() }
            true
        } catch (e: Exception) {
            main.post { Toast.makeText(context, "Could not save the file: ${e.message}", Toast.LENGTH_LONG).show() }
            false
        }
    }
}
