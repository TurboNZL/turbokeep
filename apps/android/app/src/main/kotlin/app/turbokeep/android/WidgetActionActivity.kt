package app.turbokeep.android

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/** Invisible: handles a tap on a row of the widget (tick the task off, or open its note) and finishes at once. */
class WidgetActionActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val id = intent.getStringExtra(EXTRA_ID)
        val ctx = applicationContext
        when {
            id == null -> {}
            intent.getStringExtra(EXTRA_OP) == "done" -> Thread {
                runCatching { KeepApi.call(ctx, "PATCH", "/api/notes/$id/task", "{\"done\":true}") }
                TasksWidgetProvider.refreshAll(ctx)
            }.start()
            else -> startActivity(Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_PATH, "/home/$id").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        finish()
    }

    companion object { const val EXTRA_OP = "op"; const val EXTRA_ID = "id" }
}
