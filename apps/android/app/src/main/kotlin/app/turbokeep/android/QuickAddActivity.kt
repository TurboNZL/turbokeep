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
 * A small window to add something without opening the app: the widget's + opens it, and so does "Share > TurboKeep" from another app (the shared text
 * is added). It goes on your Home list like anything typed in the app; file it under tags from there.
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
        val pad = (20 * resources.displayMetrics.density).toInt()

        input = EditText(this).apply {
            hint = "Add something"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            minLines = if (shared != null) 4 else 2
            gravity = Gravity.TOP or Gravity.START
            if (shared != null) setText(shared)
        }
        val title = TextView(this).apply { text = if (shared != null) "Save to TurboKeep" else "Add to TurboKeep"; textSize = 18f }
        val hint = TextView(this).apply { text = "The first line is the title, the rest is the description."; textSize = 12f }
        val add = Button(this).apply { text = "Add"; setOnClickListener { submit() } }
        val cancel = Button(this).apply { text = "Cancel"; setOnClickListener { finish() } }
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.END
            addView(cancel); addView(add)
        }
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad / 2)
            addView(title); addView(input, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)); addView(hint); addView(row)
        })
    }

    private fun submit() {
        val text = input.text.toString().trim()
        if (text.isEmpty()) { input.error = "Type something first"; return }
        val ctx = applicationContext
        val lines = text.lines()
        // a shared page title (the subject) becomes the title and the whole text the description; otherwise the first line is the title
        val body = JSONObject()
        if (subject?.isNotBlank() == true) { body.put("title", subject!!.take(200)); body.put("text", text) }
        else { body.put("title", lines.first().take(200)); body.put("text", lines.drop(1).joinToString("\n").trim()) }
        body.put("onList", true)
        Toast.makeText(ctx, "Saving…", Toast.LENGTH_SHORT).show()
        Thread {
            val res = runCatching { KeepApi.call(ctx, "POST", "/api/notes", body.toString()) }.getOrNull()
            val msg = when {
                res == null -> "Could not reach the server. Nothing was saved."
                res.ok -> "Added"
                res.code == 401 -> "Signed out: open TurboKeep and sign in again."
                else -> "The server said ${res.code}. Nothing was saved."
            }
            Handler(Looper.getMainLooper()).post { Toast.makeText(ctx, msg, Toast.LENGTH_LONG).show() }
            if (res?.ok == true) TasksWidgetProvider.refreshInBackground(ctx)
        }.start()
        finish()
    }
}
