package app.turbokeep.android.update

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ReleasesTest {
    private fun rel(tag: String, draft: Boolean = false, pre: Boolean = false, vararg assets: String) =
        """{"tag_name":"$tag","draft":$draft,"prerelease":$pre,"assets":[${assets.joinToString(",") { """{"name":"$it","url":"https://api.github.com/a/$it"}""" }}]}"""
    private fun list(vararg r: String) = JSONArray("[" + r.joinToString(",") + "]")

    @Test fun picksAPreReleaseWhenItIsTheNewest() {
        val r = list(rel("v2026.10.1", pre = true, assets = arrayOf("turbomusic-2026.10.1.apk")), rel("v2026.10.0", pre = true, assets = arrayOf("music-curator-2026.10.0.apk")))
        assertEquals("v2026.10.1" to "https://api.github.com/a/turbomusic-2026.10.1.apk", Releases.newestWithApk(r))
    }
    @Test fun skipsDraftsAndReleasesWithoutAnApk() {
        val r = list(rel("v3", draft = true, assets = arrayOf("a.apk")), rel("v2", assets = arrayOf("setup.exe")), rel("v1", assets = arrayOf("a.apk")))
        assertEquals("v1", Releases.newestWithApk(r)?.first)
    }
    @Test fun hasNothingToOfferWithoutAnApk() = assertNull(Releases.newestWithApk(list(rel("v1", assets = arrayOf("x.exe")))))
    @Test fun comparesCalendarVersionsNumerically() {
        assertEquals(true, Releases.isNewer("v2026.10.1", "2026.10.0"))
        assertEquals(true, Releases.isNewer("v2026.10.10", "2026.10.9"))
        assertEquals(false, Releases.isNewer("v2026.10.1", "2026.10.1"))
    }
}
