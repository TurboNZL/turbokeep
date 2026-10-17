package app.turbokeep.android

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Message
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.JsResult
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import app.turbokeep.android.update.AppUpdater

/**
 * Shows the web client (bundled in the app's assets and served from http://localhost, like TurboMusic's) full screen. The page talks to your TurboKeep
 * server across origins with a bearer token (made when you sign in, or taken from a pairing code), and behind Cloudflare Access with the service token
 * (AccessProxy). This class supplies what a browser tab cannot: the server address screen, file pick for imports, saving exports, dialogs, the token
 * for the widget, and updating the app.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val chooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data))
        fileCallback = null
    }
    private val setup = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        if (r.resultCode == Activity.RESULT_OK) load(pendingPath) else if (!ServerPrefs(this).configured) finish()
    }
    private var pendingPath: String? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        // Android 15 draws apps edge to edge and a web view does not pad the page itself: the insets go on a container around it
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val root = FrameLayout(this).apply { setBackgroundColor(0xFF0B0B10.toInt()) }
        root.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            v.setPadding(b.left, b.top, b.right, b.bottom)
            WindowInsetsCompat.CONSUMED
        }
        WindowCompat.getInsetsController(window, root).apply { isAppearanceLightStatusBars = false; isAppearanceLightNavigationBars = false }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // the page may be plain http on the home network
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            allowFileAccess = false
            allowContentAccess = false
            setSupportMultipleWindows(true)
        }
        web.setBackgroundColor(0xFF0B0B10.toInt())
        CookieManager.getInstance().setAcceptCookie(true)
        web.addJavascriptInterface(TurboKeepBridge(this) { startSetup() }, "TurboKeepAndroid")

        val accessProxy = AccessProxy(ServerPrefs(this))
        val loader = WebViewAssetLoader.Builder().setDomain(HOST).setHttpAllowed(true).addPathHandler("/", SpaAssets(this)).build()
        web.webViewClient = object : WebViewClient() {
            // the app's own pages are answered here; requests for the TurboKeep server go to it through Chromium's own network stack, and behind Cloudflare
            // Access they get the service token added (AccessProxy, as in TurboMusic); without a token nothing changes
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url) ?: accessProxy.handle(request)
            // the page is only ever http://localhost; every other link goes to the phone's browser
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == HOST) return false
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try { chooser.launch(params.createIntent()); true } catch (e: Exception) { fileCallback = null; false }
            }
            // a link that opens a new window (target=_blank in a note's Markdown) goes to the phone's browser
            override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
                val probe = WebView(view.context)
                probe.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean {
                        runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
                        v.destroy(); return true
                    }
                }
                (resultMsg.obj as WebView.WebViewTransport).webView = probe
                resultMsg.sendToTarget()
                return true
            }
            // confirm() and alert() do nothing useful in a bare web view: show them as dialogs
            override fun onJsConfirm(view: WebView, url: String, message: String, result: JsResult): Boolean {
                AlertDialog.Builder(this@MainActivity).setMessage(message).setCancelable(false)
                    .setPositiveButton("OK") { _, _ -> result.confirm() }.setNegativeButton("Cancel") { _, _ -> result.cancel() }.show()
                return true
            }
            override fun onJsAlert(view: WebView, url: String, message: String, result: JsResult): Boolean {
                AlertDialog.Builder(this@MainActivity).setMessage(message).setCancelable(false).setPositiveButton("OK") { _, _ -> result.confirm() }.show()
                return true
            }
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else { isEnabled = false; onBackPressedDispatcher.onBackPressed() }
            }
        })
        AppUpdater.listener = { s ->
            web.post { web.evaluateJavascript("window.dispatchEvent(new CustomEvent('turbokeep-update',{detail:${s.json()}}))", null) }
        }

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else if (!ServerPrefs(this).configured) { pendingPath = intent.getStringExtra(EXTRA_PATH); startSetup() }
        else load(intent.getStringExtra(EXTRA_PATH))
    }

    private fun startSetup() = setup.launch(Intent(this, SetupActivity::class.java))

    private fun load(path: String?) {
        if (!ServerPrefs(this).configured) return
        // the page is the bundled one; it asks the bridge where the server is and which token to use
        web.loadUrl("http://$HOST" + (path ?: "/"))
    }

    // a tap on a task in the widget while the app is already open
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(EXTRA_PATH)?.let { load(it) }
    }

    override fun onStart() {
        super.onStart()
        // look for a new version when the app opens, at most every 6 hours
        if (System.currentTimeMillis() - ServerPrefs(this).lastUpdateCheck > 6 * 3600_000L) AppUpdater.check(this)
    }

    override fun onStop() {
        super.onStop()
        CookieManager.getInstance().flush() // keep the sign-in cookie on disk
        TasksWidgetProvider.refreshAll(this)
    }

    override fun onSaveInstanceState(outState: Bundle) { super.onSaveInstanceState(outState); web.saveState(outState) }

    override fun onDestroy() {
        AppUpdater.listener = null
        web.destroy()
        super.onDestroy()
    }

    /**
     * Serves the bundled web client. The stock AssetsPathHandler answers a missing file (and the bare "/") with an empty response, which the WebView
     * reports as ERR_INVALID_RESPONSE, so "/" and every route of the app (/home/...) get index.html. Paths under /api/ are never the app.
     */
    private class SpaAssets(private val context: android.content.Context) : WebViewAssetLoader.PathHandler {
        override fun handle(path: String): WebResourceResponse? {
            val name = path.trimStart('/').ifEmpty { "index.html" }
            if (name.startsWith("api/"))
                return WebResourceResponse("application/json", "utf-8", 404, "Not Found", emptyMap(), java.io.ByteArrayInputStream("{\"error\":\"No server address set\"}".toByteArray()))
            val stream = try { context.assets.open(name) } catch (e: java.io.IOException) { null }
            if (stream != null) return WebResourceResponse(mime(name), null, stream)
            if (name.substringAfterLast('/').contains('.'))
                return WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), java.io.ByteArrayInputStream(ByteArray(0)))
            return WebResourceResponse("text/html", "utf-8", context.assets.open("index.html"))
        }

        private fun mime(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
            "html" -> "text/html"
            "js", "mjs" -> "text/javascript"
            "css" -> "text/css"
            "json" -> "application/json"
            "webmanifest" -> "application/manifest+json"
            "svg" -> "image/svg+xml"
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "webp" -> "image/webp"
            "ico" -> "image/x-icon"
            "woff2" -> "font/woff2"
            "woff" -> "font/woff"
            "ttf" -> "font/ttf"
            "wasm" -> "application/wasm"
            else -> "application/octet-stream"
        }
    }

    companion object {
        const val EXTRA_PATH = "path"
        /** The page is served from http://localhost (answered by the asset loader, never sent anywhere): a secure context, and no mixed-content rules, so a plain-http home server is reachable. */
        const val HOST = "localhost"
    }
}
