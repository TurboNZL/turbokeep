package app.turbokeep.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetThemeTest {
    private val appJson = """{"ui":"cyber","bg":"#0a0a10","surface":"#12121a","line":"#222233","fg":"#f2f2f2","muted":"#999999","accent":"#fdf00a","bad":"#ff5555"}"""

    @Test fun matchPhoneUsesTheTurboKeepPair() {
        assertTrue(WidgetTheme.palette("system", true, null).dark)
        assertFalse(WidgetTheme.palette("system", false, null).dark)
        assertEquals(WidgetThemes.palette("turbokeep")!!.accent, WidgetTheme.palette("system", true, null).accent)
    }

    @Test fun theEarlierNamesAreEngineThemesNow() {
        assertEquals("dark", WidgetTheme.migrate("dark")) // the engine's Slate
        assertEquals("turbokeep-light", WidgetTheme.migrate("light"))
        assertEquals("sand", WidgetTheme.migrate("paper"))
        for (old in listOf("dark", "light", "midnight", "forest", "plum", "paper")) assertNotNull(old, WidgetThemes.palette(WidgetTheme.migrate(old)))
    }

    @Test fun everyListedPaletteResolvesAndLightOnesAreNotDark() {
        for (p in WidgetThemes.PALETTES) assertEquals(p.bg, WidgetTheme.palette(p.id, true, null).bg)
        assertFalse(WidgetTheme.palette("daylight", true, null).dark)
        assertTrue(WidgetTheme.palette("nord", false, null).dark)
        assertEquals(WidgetTheme.palette("system", true, null).bg, WidgetTheme.palette("no-such-theme", true, null).bg)
    }

    @Test fun matchTheAppUsesWhatThePageSentAndFallsBackWithoutIt() {
        val app = WidgetTheme.parseAppLook(appJson)
        assertNotNull(app)
        assertEquals(0xFF0A0A10.toInt(), WidgetTheme.palette("app", false, app).bg)
        assertTrue(WidgetTheme.palette("app", false, app).dark)
        assertEquals(WidgetTheme.palette("system", true, null).bg, WidgetTheme.palette("app", true, null).bg)
        assertNull(WidgetTheme.parseAppLook("not json"))
        assertNull(WidgetTheme.parseAppLook(""))
    }

    @Test fun fontsFollowTheStyle() {
        val app = WidgetTheme.parseAppLook(appJson)
        assertEquals("sans-serif-condensed", WidgetTheme.family("app", app))
        assertEquals("sans-serif", WidgetTheme.family("app", null))
        assertEquals("monospace", WidgetTheme.family("pipboy", app))
        for (id in WidgetThemes.OFFERED_STYLES) assertNotNull(id, WidgetThemes.style(id))
    }

    @Test fun textOnAnAccentIsReadable() {
        assertEquals(0xFF1A1206.toInt(), WidgetTheme.onColor(0xFFFFB020.toInt()))
        assertEquals(0xFFFFFFFF.toInt(), WidgetTheme.onColor(0xFF9B7BF2.toInt()))
    }

    @Test fun anUnknownAccentMeansTheThemes() = assertEquals(0, WidgetTheme.accent("nope"))
}
