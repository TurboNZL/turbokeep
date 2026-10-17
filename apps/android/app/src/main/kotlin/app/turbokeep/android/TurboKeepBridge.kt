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
import org.json.JSONObject

/**
 * What the web page can ask the app for, as `window.TurboKeepAndroid`: strings only, results as JSON (the engine's bridge rules).
 * The page uses it to hand over the API token the widget needs, to save exports into Downloads, and for the update card in Settings > This app.
 */
class TurboKeepBridge(private val context: Context) {
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
