package app.turbokeep.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AccessRouteTest {
    @Test fun originNormalisesDefaultPorts() {
        assertEquals("https://keep.example.com:443", AccessRoute.origin("https://Keep.Example.com/api/notes"))
        assertEquals("http://192.168.1.5:47901", AccessRoute.origin("http://192.168.1.5:47901"))
        assertEquals("", AccessRoute.origin("not a url"))
        assertEquals("", AccessRoute.origin("ftp://x.y/z"))
    }

    @Test fun onlyTheServerIsProxied() {
        assertTrue(AccessRoute.isServerRequest("https://keep.example.com", "https://keep.example.com/api/notes"))
        assertFalse(AccessRoute.isServerRequest("https://keep.example.com", "https://other.example.com/x"))
        assertFalse(AccessRoute.isServerRequest("", "https://keep.example.com/x"))
        assertFalse(AccessRoute.isServerRequest("http://localhost", "https://appassets.example/x"))
    }

    @Test fun browserBookkeepingIsNotForwarded() {
        val out = AccessRoute.forwardable(mapOf("Range" to "bytes=0-", "Origin" to "http://localhost", "Cookie" to "a=b", "Authorization" to "Bearer t"))
        assertEquals(setOf("Range", "Authorization"), out.keys)
    }

    @Test fun preflightEchoesTheRequestedHeaders() {
        assertEquals("range, cf-access-client-id", AccessRoute.preflightHeaders("range, cf-access-client-id")["Access-Control-Allow-Headers"])
        assertEquals("*", AccessRoute.preflightHeaders(null)["Access-Control-Allow-Origin"])
    }

    @Test fun preflightAllowsEveryMethodTheApiUses() {
        val methods = AccessRoute.preflightHeaders(null)["Access-Control-Allow-Methods"]!!.split(",").map { it.trim() }
        for (m in listOf("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")) assertTrue("$m is missing", m in methods)
    }

    @Test fun answerHeadersNeverCarryTwoAllowOrigins() {
        val out = AccessRoute.answerHeaders(mapOf("access-control-allow-origin" to "*", "Access-Control-Expose-Headers" to "X", "Transfer-Encoding" to "chunked", "Content-Type" to "application/json"))
        assertEquals(1, out.keys.count { it.equals("Access-Control-Allow-Origin", ignoreCase = true) })
        assertEquals(1, out.keys.count { it.equals("Access-Control-Expose-Headers", ignoreCase = true) })
        assertEquals("application/json", out["Content-Type"])
        assertEquals(false, out.keys.any { it.equals("Transfer-Encoding", ignoreCase = true) })
    }
}
