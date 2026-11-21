package app.turbokeep.android

import android.content.Context
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.os.Build
import android.widget.RemoteViews

/**
 * How the widgets look: a colour theme, an accent, how see-through the background is, how round the corners are and whether items are outlined.
 * A widget can only be changed through RemoteViews, which cannot recolour a shape, so every coloured surface is a white shape in an ImageView that is
 * tinted (`setColorFilter`) and faded (`setImageAlpha`) from here; both work on every Android version the app supports.
 * "Match phone" follows the dark/light setting at the moment the widget is drawn (a refresh or any change in the app redraws it).
 */
object WidgetTheme {
    class Palette(val bg: Int, val text: Int, val muted: Int, val bad: Int, val dark: Boolean)

    val THEMES = listOf("system" to "Match phone", "dark" to "Dark", "light" to "Light", "midnight" to "Midnight", "forest" to "Forest", "plum" to "Plum", "paper" to "Paper")
    val ACCENTS = listOf("amber" to 0xFFFFB020.toInt(), "orange" to 0xFFFF7A33.toInt(), "red" to 0xFFE5484D.toInt(), "pink" to 0xFFF2599C.toInt(), "purple" to 0xFF9B7BF2.toInt(),
        "blue" to 0xFF4C9AFF.toInt(), "teal" to 0xFF2BC4B4.toInt(), "green" to 0xFF4CC26B.toInt())
    val CORNERS = listOf("sq" to "Square", "md" to "Rounded", "lg" to "Very round")

    fun palette(theme: String, nightPhone: Boolean): Palette = when (if (theme == "system") (if (nightPhone) "dark" else "light") else theme) {
        "light" -> Palette(0xFFF8F8FA.toInt(), 0xFF1B1B20.toInt(), 0xFF6A6A75.toInt(), 0xFFC62828.toInt(), false)
        "midnight" -> Palette(0xFF0B1020.toInt(), 0xFFE6ECFF.toInt(), 0xFF8C98B8.toInt(), 0xFFFF7A70.toInt(), true)
        "forest" -> Palette(0xFF0F1D16.toInt(), 0xFFE4F2E8.toInt(), 0xFF8FA99A.toInt(), 0xFFFF7A70.toInt(), true)
        "plum" -> Palette(0xFF1D1226.toInt(), 0xFFF1E8F7.toInt(), 0xFFA793B3.toInt(), 0xFFFF7A70.toInt(), true)
        "paper" -> Palette(0xFFFBF4E6.toInt(), 0xFF2A2216.toInt(), 0xFF7C6F58.toInt(), 0xFFB3261E.toInt(), false)
        else -> Palette(0xFF15151B.toInt(), 0xFFF2F2F5.toInt(), 0xFF9A9AA5.toInt(), 0xFFFF6B5E.toInt(), true)
    }

    fun accent(key: String): Int = ACCENTS.firstOrNull { it.first == key }?.second ?: ACCENTS[0].second

    /** black or white text, whichever reads better on `color` */
    fun onColor(color: Int): Int {
        val r = (color shr 16) and 255; val g = (color shr 8) and 255; val b = color and 255
        return if (0.299 * r + 0.587 * g + 0.114 * b > 150) 0xFF1A1206.toInt() else 0xFFFFFFFF.toInt()
    }

    fun cornersDrawable(key: String): Int = when (key) { "sq" -> R.drawable.widget_bg_sq; "lg" -> R.drawable.widget_bg_lg; else -> R.drawable.widget_bg_md }

    /** everything a drawing needs, read once from the saved choices */
    class Look(val p: Palette, val accent: Int, val btnText: Int, val bgAlpha: Int, val corners: Int, val outline: Boolean)

    fun look(ctx: Context): Look {
        val prefs = ServerPrefs(ctx)
        val night = (ctx.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        val accent = accent(prefs.widgetAccent)
        return Look(palette(prefs.widgetTheme, night), accent, onColor(accent), (prefs.widgetOpacity * 255 / 100).coerceIn(0, 255), cornersDrawable(prefs.widgetCorners), prefs.widgetOutline)
    }

    /** tint one of the white shape layers (opaque colour, faded by `alpha` 0..255) */
    fun layer(v: RemoteViews, id: Int, color: Int, alpha: Int = 255) { v.setInt(id, "setColorFilter", color); v.setInt(id, "setImageAlpha", alpha) }

    /** the frame every widget shares: background, the round buttons (their fill, icon colour and spinner) and the empty message */
    fun paintFrame(v: RemoteViews, look: Look, buttons: List<Int>) {
        v.setImageViewResource(R.id.bg, look.corners)
        layer(v, R.id.bg, look.p.bg, look.bgAlpha)
        v.setTextColor(R.id.empty, look.p.muted)
        for (b in buttons) v.setInt(b, "setBackgroundResource", if (look.p.dark) R.drawable.widget_fab_bg else R.drawable.widget_fab_bg_light)
        for (b in listOf(R.id.open, R.id.refresh)) v.setInt(b, "setColorFilter", look.p.text)
        if (Build.VERSION.SDK_INT >= 31) v.setColorStateList(R.id.refresh_spin, "setIndeterminateTintList", ColorStateList.valueOf(look.accent))
    }
}
