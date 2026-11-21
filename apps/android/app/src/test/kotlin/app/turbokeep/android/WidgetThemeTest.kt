package app.turbokeep.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetThemeTest {
    @Test fun matchPhoneFollowsTheNightSetting() {
        assertTrue(WidgetTheme.palette("system", true).dark)
        assertFalse(WidgetTheme.palette("system", false).dark)
    }

    @Test fun everyThemeResolvesAndLightOnesAreNotDark() {
        for ((key, _) in WidgetTheme.THEMES) WidgetTheme.palette(key, true)
        assertFalse(WidgetTheme.palette("light", true).dark)
        assertFalse(WidgetTheme.palette("paper", true).dark)
        assertTrue(WidgetTheme.palette("midnight", false).dark)
    }

    @Test fun textOnAnAccentIsReadable() {
        assertEquals(0xFF1A1206.toInt(), WidgetTheme.onColor(WidgetTheme.accent("amber")))
        assertEquals(0xFFFFFFFF.toInt(), WidgetTheme.onColor(WidgetTheme.accent("purple")))
    }

    @Test fun anUnknownAccentIsTheDefault() = assertEquals(WidgetTheme.ACCENTS[0].second, WidgetTheme.accent("nope"))
}
