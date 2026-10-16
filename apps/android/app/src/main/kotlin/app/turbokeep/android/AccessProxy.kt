package app.turbokeep.android

import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

/** Pure decisions of [AccessProxy] (no Android classes). Same idea as TurboMusic's AccessProxy, which pairs fine behind Cloudflare Access. */
object AccessRoute {
    /** "scheme://host:port" of a URL, lower-cased; "" when it is not an http(s) URL. */
    fun origin(url: String): String = try {
        val u = URI(url.trim())
        val scheme = u.scheme?.lowercase() ?: ""
        val port = if (u.port >= 0) u.port else if (scheme == "https") 443 else 80
        if ((scheme == "http" || scheme == "https") && !u.host.isNullOrEmpty()) "$scheme://${u.host.lowercase()}:$port" else ""
    } catch (e: Exception) { "" }

    /** The request is for the TurboKeep server (the only place the service token may go). */
    fun isServerRequest(serverUrl: String, requestUrl: String): Boolean {
        val s = origin(serverUrl)
        return s.isNotEmpty() && s == origin(requestUrl)
    }

    /** Request headers worth forwarding: not the browser's own bookkeeping (cookies are added from the web view's jar, encodings are negotiated by the connection itself). */
    fun forwardable(headers: Map<String, String>): Map<String, String> =
        headers.filterKeys { it.lowercase() !in setOf("host", "cookie", "connection", "accept-encoding", "if-none-match", "if-modified-since") }

    /** The upstream answer's headers as the web view should get them: no hop-by-hop headers, no cookies (set separately), no encoding/length (the body is already decoded). */
    fun answerHeaders(upstream: Map<String, String>): Map<String, String> {
        val drop = setOf("transfer-encoding", "connection", "keep-alive", "proxy-authenticate", "te", "trailer", "upgrade", "set-cookie", "content-encoding", "content-length")
        return upstream.filterKeys { it.lowercase() !in drop }
    }

    /** "text/html; charset=utf-8" -> ("text/html", "utf-8") */
    fun mimeAndCharset(contentType: String?): Pair<String, String?> {
        val t = contentType ?: return "application/octet-stream" to null
        val mime = t.substringBefore(';').trim().ifEmpty { "application/octet-stream" }
        val charset = Regex("charset=([^;\\s]+)", RegexOption.IGNORE_CASE).find(t)?.groupValues?.get(1)?.trim('"')
        return mime to charset
    }
}

/**
 * The page is the server's own, and behind Cloudflare Access every request needs the service token (CF-Access-Client-Id / -Secret); a web view's page
 * requests (the page itself, scripts, styles, images, API reads) cannot send it. Here the token is added to those GET/HEAD requests natively, with the web
 * view's own cookies, and the answer's cookies (Access's CF_Authorization, the TurboKeep session) go back into the web view's jar. Requests with a body are
 * not visible here: the page adds the headers itself (`TurboKeepAndroid.accessHeaders()`). Does nothing without a token.
 */
class AccessProxy(private val prefs: ServerPrefs) {
    fun handle(request: WebResourceRequest): WebResourceResponse? {
        val extra = prefs.accessHeaders()
        if (extra.isEmpty()) return null
        val url = request.url.toString()
        if (!AccessRoute.isServerRequest(prefs.serverUrl, url)) return null
        if (request.method.uppercase() !in setOf("GET", "HEAD")) return null
        return try { fetch(request, url, extra) } catch (e: Exception) { null } // fall back to the web view's own request
    }

    private fun fetch(request: WebResourceRequest, url: String, extra: Map<String, String>): WebResourceResponse? {
        val c = URL(url).openConnection() as HttpURLConnection
        c.requestMethod = request.method.uppercase()
        c.connectTimeout = 15_000
        c.readTimeout = 60_000
        c.instanceFollowRedirects = true
        AccessRoute.forwardable(request.requestHeaders).forEach { (k, v) -> c.setRequestProperty(k, v) }
        val cookies = CookieManager.getInstance().getCookie(url)
        if (!cookies.isNullOrEmpty()) c.setRequestProperty("Cookie", cookies)
        extra.forEach { (k, v) -> c.setRequestProperty(k, v) }
        val code = c.responseCode
        if (code in 300..399) { c.disconnect(); return null } // a web view cannot be handed a redirect from here
        c.headerFields["Set-Cookie"]?.forEach { CookieManager.getInstance().setCookie(url, it) }
        val upstream = LinkedHashMap<String, String>()
        for ((k, v) in c.headerFields) if (k != null && v.isNotEmpty()) upstream[k] = v.last()
        val (mime, charset) = AccessRoute.mimeAndCharset(c.contentType)
        val body = if (code >= 400) c.errorStream else c.inputStream
        return WebResourceResponse(mime, charset, code, c.responseMessage?.takeIf { it.isNotBlank() } ?: if (code == 206) "Partial Content" else "OK", AccessRoute.answerHeaders(upstream), body ?: ByteArrayInputStream(ByteArray(0)))
    }
}
