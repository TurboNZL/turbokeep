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
    /** `accentFg` is not used for button text (WidgetTheme.onColor keeps it readable on any accent) */
    class Palette(val bg: Int, val surface: Int, val line: Int, val text: Int, val muted: Int, val bad: Int, val accent: Int, val dark: Boolean)

    /** What the "Theme" list offers: follow the app, follow the phone's dark/light, or one of the engine's palettes (WidgetThemes, generated from TurboNZL/turboengine) */
    val SOURCES = listOf("app" to "Match the app", "system" to "Match the phone (TurboKeep light/dark)")
    val ACCENTS = listOf("theme" to 0, "amber" to 0xFFFFB020.toInt(), "orange" to 0xFFFF7A33.toInt(), "red" to 0xFFE5484D.toInt(), "pink" to 0xFFF2599C.toInt(), "purple" to 0xFF9B7BF2.toInt(),
        "blue" to 0xFF4C9AFF.toInt(), "teal" to 0xFF2BC4B4.toInt(), "green" to 0xFF4CC26B.toInt())
    val CORNERS = listOf("sq" to "Square", "md" to "Rounded", "lg" to "Very round")
    const val DEFAULT_PALETTE = "turbokeep"

    /** the names this app's first widget release saved that are not engine palette ids ("dark" is the engine's own Slate now, and stays that) */
    fun migrate(theme: String): String = when (theme) { "light" -> "turbokeep-light"; "paper" -> "sand"; else -> theme }

    private fun p(x: WidgetThemes.P) = Palette(x.bg, x.surface, x.line, x.fg, x.muted, x.bad, x.accent, x.dark)
    private fun fallback(night: Boolean) = p(WidgetThemes.palette(if (night) DEFAULT_PALETTE else "turbokeep-light")!!)

    /** the colours the page last sent (`setWidgetLook`), as {"ui", "bg", "surface", "line", "fg", "muted", "accent", "bad"} with #rrggbb values; null when none or unreadable */
    class AppLook(val ui: String, val palette: Palette)
    fun parseAppLook(json: String?): AppLook? {
        if (json.isNullOrBlank()) return null
        return try {
            val o = org.json.JSONObject(json)
            fun c(k: String) = (java.lang.Long.parseLong(o.getString(k).removePrefix("#"), 16).toInt()) or 0xFF000000.toInt()
            val bg = c("bg"); val fg = c("fg")
            AppLook(o.optString("ui", "default"), Palette(bg, c("surface"), c("line"), fg, c("muted"), c("bad"), c("accent"), luminance(bg) < luminance(fg)))
        } catch (e: Exception) { null }
    }

    private fun luminance(c: Int) = 0.299 * ((c shr 16) and 255) + 0.587 * ((c shr 8) and 255) + 0.114 * (c and 255)

    /** the palette for a saved choice ("app", "system" or an engine palette id) */
    fun palette(theme: String, night: Boolean, app: AppLook?): Palette = when (val t = migrate(theme)) {
        "app" -> app?.palette ?: fallback(night)
        "system" -> fallback(night)
        else -> WidgetThemes.palette(t)?.let { p(it) } ?: fallback(night)
    }

    /** the Android font family for a saved font choice ("app" = the app's own UI style, else an engine style id) */
    fun family(font: String, app: AppLook?): String = WidgetThemes.style(if (font == "app") (app?.ui ?: "default") else font)?.family ?: "sans-serif"

    fun accent(key: String): Int = ACCENTS.firstOrNull { it.first == key }?.second ?: 0

    /** black or white text, whichever reads better on `color` */
    fun onColor(color: Int): Int = if (luminance(color) > 150) 0xFF1A1206.toInt() else 0xFFFFFFFF.toInt()

    fun cornersDrawable(key: String): Int = when (key) { "sq" -> R.drawable.widget_bg_sq; "lg" -> R.drawable.widget_bg_lg; else -> R.drawable.widget_bg_md }

    /** everything a drawing needs, read once from the saved choices */
    class Look(val p: Palette, val accent: Int, val btnText: Int, val bgAlpha: Int, val corners: Int, val outline: Boolean, val family: String)

    fun look(ctx: Context): Look {
        val prefs = ServerPrefs(ctx)
        val night = (ctx.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        val app = parseAppLook(prefs.appLook)
        val pal = palette(prefs.widgetTheme, night, app)
        val custom = accent(prefs.widgetAccent)
        val accent = if (custom != 0) custom else pal.accent
        return Look(pal, accent, onColor(accent), (prefs.widgetOpacity * 255 / 100).coerceIn(0, 255), cornersDrawable(prefs.widgetCorners), prefs.widgetOutline, family(prefs.widgetFont, app))
    }

    /** text in the theme's font: a RemoteViews cannot change a view's typeface, but it carries spans, and a TypefaceSpan names one of Android's own families */
    fun styled(text: CharSequence, family: String): CharSequence =
        if (family == "sans-serif" || text.isEmpty()) text else android.text.SpannableString(text).apply { setSpan(android.text.style.TypefaceSpan(family), 0, length, android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE) }

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
