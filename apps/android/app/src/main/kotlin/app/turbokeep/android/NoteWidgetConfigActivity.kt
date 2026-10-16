package app.turbokeep.android

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/** Which note a one-note widget shows: a list of your notes (type to narrow it). Opens when the widget is added and from its open button until a note is chosen. */
class NoteWidgetConfigActivity : AppCompatActivity() {
    private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID
    private var all: List<Pair<String, String>> = emptyList()
    private var shown: List<Pair<String, String>> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        // closing without a choice cancels (a widget that was just added is removed again)
        setResult(Activity.RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
        setFinishOnTouchOutside(true)
        val pad = (20 * resources.displayMetrics.density).toInt()
        val status = TextView(this).apply { text = "Loading your notes…"; textSize = 12f }
        val filter = EditText(this).apply { hint = "Type to find a note"; setSingleLine() }
        val names = ArrayAdapter<String>(this, android.R.layout.simple_list_item_1, ArrayList())
        val list = ListView(this)
        list.adapter = names
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad / 2)
            addView(TextView(context).apply { text = "Which note?"; textSize = 18f })
            addView(filter, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            addView(status)
            addView(list, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, (360 * resources.displayMetrics.density).toInt()))
        })
        if (!ServerPrefs(this).signedIn) { status.text = "Open TurboKeep and sign in first."; return }

        fun refilter() {
            val q = filter.text.toString().trim().lowercase()
            shown = all.filter { q.isEmpty() || it.second.lowercase().contains(q) }
            names.clear(); names.addAll(shown.map { it.second }); names.notifyDataSetChanged()
        }
        filter.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) { refilter() }
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
        })
        list.setOnItemClickListener { _, _, pos, _ ->
            val noteId = shown.getOrNull(pos)?.first ?: return@setOnItemClickListener
            val prefs = ServerPrefs(this)
            prefs.setNoteOf(widgetId, noteId)
            setResult(Activity.RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
            WidgetRefresh.start(applicationContext, announce = false)
            finish()
        }
        Thread {
            val choices = WidgetData.fetchChoices(applicationContext)
            runOnUiThread {
                if (isFinishing) return@runOnUiThread
                if (choices == null) { status.text = "Could not reach the server."; return@runOnUiThread }
                all = choices; status.text = if (choices.isEmpty()) "You have no notes yet." else "Tap a note."; refilter()
            }
        }.start()
    }
}
