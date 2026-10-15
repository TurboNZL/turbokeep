package app.turbokeep.android

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/** Invisible: handles a tap in the widget's list (finish an item, open one up, save one to memory) and finishes at once. */
class WidgetActionActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val id = intent.getStringExtra(EXTRA_ID)
        if (id == null) { finish(); return }
        val ctx = applicationContext
        val prefs = ServerPrefs(ctx)
        when {
            intent.getStringExtra(EXTRA_OP) == "done" -> {
                // finishing = archiving. The list loses it at once; the server is told, then asked for the real list
                WidgetData.forget(ctx, id)
                if (prefs.widgetOpen == id) prefs.widgetOpen = ""
                TasksWidgetProvider.redraw(ctx)
                Thread {
                    runCatching { KeepApi.call(ctx, "PATCH", "/api/notes/$id", "{\"archived\":true}") }
                    TasksWidgetProvider.refreshInBackground(ctx)
                }.start()
            }
            // "commit to memory": the app opens on the item with the tag picker ready, so it can be filed under tags
            intent.getStringExtra(EXTRA_OP) == "memory" -> {
                prefs.widgetOpen = ""
                TasksWidgetProvider.redraw(ctx)
                startActivity(Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_PATH, "/home/$id?send=1").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            // a tap on an item opens it up a little (a second tap closes it again)
            intent.getStringExtra(EXTRA_OP) == "toggle" -> {
                prefs.widgetOpen = if (prefs.widgetOpen == id) "" else id
                TasksWidgetProvider.redraw(ctx)
            }
            else -> startActivity(Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_PATH, "/home/$id").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        finish()
    }

    companion object { const val EXTRA_OP = "op"; const val EXTRA_ID = "id" }
}
