package app.turbokeep.android

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.Spinner
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * What the list widget's open button shows (unless that is turned off here): which notes the widget lists (your tasks or one tag), text size, the space
 * between items and the order. A tap outside the window closes it. It is also the widget's configure screen: it opens when a list widget is added, and
 * from the widget's Reconfigure entry (long press), which is the way back here when the open button goes straight to the app.
 */
class WidgetSettingsActivity : AppCompatActivity() {
    private val prefs by lazy { ServerPrefs(this) }
    private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        widgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        // the widget exists with its defaults already: closing this any way at all keeps it (a cancelled configure would remove it)
        setResult(Activity.RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
        setFinishOnTouchOutside(true)
        val pad = (20 * resources.displayMetrics.density).toInt()
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, pad, pad, pad / 2) }
        root.addView(TextView(this).apply { text = "Widget"; textSize = 18f })

        // which notes: your tasks, or one tag's notes (the list is asked from the server)
        if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
            root.addView(TextView(this).apply { text = "Show"; setPadding(0, pad / 2, 0, 0) })
            val current = prefs.widgetTag(widgetId)
            val names = ArrayList<String>().apply { add("Tasks"); if (current.isNotEmpty()) add(current) }
            val tags = ArrayList<String>().apply { if (current.isNotEmpty()) add(current) }
            val choices = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, names)
            val spinner = Spinner(this)
            spinner.adapter = choices
            spinner.setSelection(if (current.isEmpty()) 0 else 1)
            spinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                override fun onItemSelected(p: AdapterView<*>?, v: View?, pos: Int, id: Long) {
                    val tag = if (pos <= 0) "" else tags.getOrNull(pos - 1) ?: return
                    if (tag == prefs.widgetTag(widgetId)) return
                    prefs.setWidgetTag(widgetId, tag); prefs.setWidgetOpen(widgetId, "")
                    WidgetRefresh.start(applicationContext, announce = false)
                }
                override fun onNothingSelected(p: AdapterView<*>?) {}
            }
            root.addView(spinner, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            root.addView(TextView(this).apply { text = "Tasks, or the notes you sent to one tag (then the buttons say Archive and Send to tasks)."; textSize = 12f })
            Thread {
                val fetched = WidgetData.fetchTagTitles(applicationContext) ?: return@Thread
                runOnUiThread {
                    if (isFinishing) return@runOnUiThread
                    val keep = prefs.widgetTag(widgetId)
                    tags.clear(); tags.addAll((fetched + keep).filter { it.isNotEmpty() }.toSortedSet(String.CASE_INSENSITIVE_ORDER))
                    names.clear(); names.add("Tasks"); names.addAll(tags)
                    choices.notifyDataSetChanged()
                    spinner.setSelection(if (keep.isEmpty()) 0 else names.indexOf(keep).coerceAtLeast(0), false)
                }
            }.start()
        }

        fun slider(label: String, max: Int, value: Int, show: (Int) -> String, onChange: (Int) -> Unit) {
            val caption = TextView(this).apply { text = "$label: ${show(value)}"; setPadding(0, pad / 2, 0, 0) }
            val bar = SeekBar(this).apply {
                this.max = max; progress = value
                setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                    override fun onProgressChanged(s: SeekBar, p: Int, fromUser: Boolean) { caption.text = "$label: ${show(p)}" }
                    override fun onStartTrackingTouch(s: SeekBar) {}
                    override fun onStopTrackingTouch(s: SeekBar) { onChange(s.progress); WidgetRefresh.redrawAll(applicationContext) }
                })
            }
            root.addView(caption); root.addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        // text size 50% .. 200% in steps of 10 (0..15); space -10 .. 20 dp (0..30)
        slider("Text size", 15, Math.round((prefs.widgetZoom - 0.5f) * 10f), { "${50 + it * 10}%" }) { prefs.widgetZoom = 0.5f + it / 10f }
        slider("Space between items", 30, prefs.widgetSpacing + 10, { "${it - 10} dp" }) { prefs.widgetSpacing = it - 10 }

        root.addView(TextView(this).apply { text = "Order"; setPadding(0, pad / 2, 0, 0) })
        val group = RadioGroup(this)
        for ((key, label) in WidgetData.SORTS) {
            group.addView(RadioButton(this).apply { text = label; tag = key; id = View.generateViewId(); isChecked = prefs.widgetSort == key })
        }
        group.setOnCheckedChangeListener { g, checked ->
            prefs.widgetSort = g.findViewById<RadioButton>(checked)?.tag as? String ?: "manual"
            WidgetRefresh.redrawAll(applicationContext)
        }
        root.addView(group)

        root.addView(CheckBox(this).apply {
            text = "The open button shows these settings first"; isChecked = prefs.openShowsSettings
            setOnCheckedChangeListener { _, on -> prefs.openShowsSettings = on; WidgetRefresh.redrawAll(applicationContext) }
        })
        root.addView(TextView(this).apply { text = "Off: the open button goes straight to TurboKeep. These settings stay one long press away on the widget (Reconfigure)."; textSize = 12f })

        val open = Button(this).apply { text = "Open TurboKeep"; setOnClickListener { startActivity(Intent(this@WidgetSettingsActivity, MainActivity::class.java)); finish() } }
        val add = Button(this).apply { text = "Add something"; setOnClickListener { startActivity(Intent(this@WidgetSettingsActivity, QuickAddActivity::class.java)); finish() } }
        val server = Button(this).apply { text = "Server and Cloudflare Access"; setOnClickListener { startActivity(Intent(this@WidgetSettingsActivity, SetupActivity::class.java)) } }
        val done = Button(this).apply { text = "Done"; setOnClickListener { finish() } }
        root.addView(LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = android.view.Gravity.END; addView(add); addView(open) })
        root.addView(LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = android.view.Gravity.END; addView(server); addView(done) })
        setContentView(ScrollView(this).apply { addView(root) })
    }

    override fun onStop() {
        super.onStop()
        WidgetRefresh.redrawAll(applicationContext)
    }
}
