package app.turbokeep.android

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle

/**
 * Invisible: handles a tap in the list widget and finishes at once. `open` opens an item up over the whole widget, `collapse` closes it again, `done`
 * finishes (archives) it, `tags` opens the app on the item with the tag picker ready, `tasks` sends a tag's note to your task list.
 */
class WidgetActionActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val id = intent.getStringExtra(EXTRA_ID)
        val widget = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        if (id == null) { finish(); return }
        val ctx = applicationContext
        val prefs = ServerPrefs(ctx)
        when (intent.getStringExtra(EXTRA_OP)) {
            "open" -> { prefs.setWidgetOpen(widget, id); TasksWidgetProvider.redraw(ctx) }
            "collapse" -> { prefs.setWidgetOpen(widget, ""); TasksWidgetProvider.redraw(ctx) }
            // finishing = archiving. The list loses it at once; the server is told, then asked for the real list
            "done" -> leave(ctx, widget, id, "{\"archived\":true}")
            // sending a tag's note to your tasks: it gets its checkbox and leaves this tag's list
            "tasks" -> leave(ctx, widget, id, "{\"onList\":true}")
            // the app opens on the item with the tag picker ready, so it can be sent to tags
            "tags" -> {
                prefs.setWidgetOpen(widget, "")
                TasksWidgetProvider.redraw(ctx)
                startActivity(Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_PATH, "/home/$id?send=1").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            else -> {}
        }
        finish()
    }

    private fun leave(ctx: android.content.Context, widget: Int, id: String, patch: String) {
        WidgetData.forget(ctx, id)
        ServerPrefs(ctx).setWidgetOpen(widget, "")
        TasksWidgetProvider.redraw(ctx)
        Thread {
            runCatching { KeepApi.call(ctx, "PATCH", "/api/notes/$id", patch) }
            WidgetRefresh.start(ctx, announce = false)
        }.start()
    }

    companion object { const val EXTRA_OP = "op"; const val EXTRA_ID = "id" }
}
