package app.turbokeep.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AccessRouteTest {
    @Test fun theTokenOnlyGoesToTheServersOwnOrigin() {
        assertTrue(AccessRoute.isServerRequest("https://keep.example.com", "https://keep.example.com/api/notes"))
        assertTrue(AccessRoute.isServerRequest("http://192.168.1.20:47901", "http://192.168.1.20:47901/assets/a.js"))
        assertFalse(AccessRoute.isServerRequest("https://keep.example.com", "https://other.example.com/api/notes"))
        assertFalse(AccessRoute.isServerRequest("https://keep.example.com", "http://keep.example.com/api/notes")) // other scheme/port
        assertFalse(AccessRoute.isServerRequest("", "https://keep.example.com/"))
    }

    @Test fun cookiesAndEncodingsAreLeftToTheConnection() {
        val out = AccessRoute.forwardable(mapOf("Cookie" to "a=b", "Accept-Encoding" to "gzip", "If-None-Match" to "x", "Accept" to "text/html", "Range" to "bytes=0-9"))
        assertEquals(setOf("Accept", "Range"), out.keys)
    }

    @Test fun answersLoseTheirCookiesAndEncoding() {
        val out = AccessRoute.answerHeaders(mapOf("Set-Cookie" to "x=1", "Content-Encoding" to "gzip", "Content-Length" to "9", "Content-Type" to "text/html", "Cache-Control" to "no-store"))
        assertEquals(setOf("Content-Type", "Cache-Control"), out.keys)
    }

    @Test fun splitsContentType() {
        assertEquals("text/html" to "utf-8", AccessRoute.mimeAndCharset("text/html; charset=utf-8"))
        assertEquals("application/json" to null, AccessRoute.mimeAndCharset("application/json"))
        assertEquals("application/octet-stream" to null, AccessRoute.mimeAndCharset(null))
    }
}
