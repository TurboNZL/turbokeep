package app.turbokeep.android

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject

/**
 * A small window to add a task or a note without opening the app: the widget's + buttons open it, and so does "Share > TurboKeep" from another
 * app (the shared text becomes a note).
 */
class QuickAddActivity : AppCompatActivity() {
    private lateinit var input: EditText
    private var subject: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!ServerPrefs(this).signedIn) {
            Toast.makeText(this, "Open TurboKeep and sign in first.", Toast.LENGTH_LONG).show()
            startActivity(Intent(this, MainActivity::class.java))
            finish(); return
        }
        val shared = if (intent.action == Intent.ACTION_SEND) intent.getStringExtra(Intent.EXTRA_TEXT) else null
        subject = if (shared != null) intent.getStringExtra(Intent.EXTRA_SUBJECT) else null
        val mode = intent.getStringExtra(EXTRA_MODE) ?: if (shared != null) "note" else "task"
        val pad = (20 * resources.displayMetrics.density).toInt()

        input = EditText(this).apply {
            hint = if (mode == "note") "Write a note" else "What needs doing?"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            minLines = if (mode == "note" || shared != null) 4 else 1
            gravity = Gravity.TOP or Gravity.START
            if (shared != null) setText(shared)
        }
        val title = TextView(this).apply { text = if (shared != null) "Save to TurboKeep" else "Add to TurboKeep"; textSize = 18f }
        val taskBtn = Button(this).apply { text = "Add task"; setOnClickListener { submit(true) } }
        val noteBtn = Button(this).apply { text = "Add note"; setOnClickListener { submit(false) } }
        val cancel = Button(this).apply { text = "Cancel"; setOnClickListener { finish() } }
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.END
            addView(cancel); addView(noteBtn); addView(taskBtn)
        }
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad / 2)
            addView(title); addView(input, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)); addView(row)
        })
    }

    private fun submit(task: Boolean) {
        val text = input.text.toString().trim()
        if (text.isEmpty()) { input.error = "Type something first"; return }
        val ctx = applicationContext
        val body = JSONObject()
        val path: String
        if (task) { path = "/api/tasks"; body.put("title", text.lines().first().take(200)); if (text.lines().size > 1) body.put("description", text.lines().drop(1).joinToString("\n").trim()) }
        else { path = "/api/notes"; body.put("title", subject?.takeIf { it.isNotBlank() } ?: KeepApi.dateTitle()); body.put("text", text) }
        Toast.makeText(ctx, "Saving…", Toast.LENGTH_SHORT).show()
        Thread {
            val res = runCatching { KeepApi.call(ctx, "POST", path, body.toString()) }.getOrNull()
            val msg = when {
                res == null -> "Could not reach the server. Nothing was saved."
                res.ok -> if (task) "Task added" else "Note saved"
                res.code == 401 -> "Signed out: open TurboKeep and sign in again."
                else -> "The server said ${res.code}. Nothing was saved."
            }
            Handler(Looper.getMainLooper()).post { Toast.makeText(ctx, msg, Toast.LENGTH_LONG).show() }
            if (res?.ok == true) TasksWidgetProvider.refreshAll(ctx)
        }.start()
        finish()
    }

    companion object { const val EXTRA_MODE = "mode" }
}
