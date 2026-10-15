package app.turbokeep.android

import android.content.Intent
import android.os.Bundle
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.SeekBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/** What the widget's title opens: text size, the space between items and the order. Every change shows on the widget straight away. */
class WidgetSettingsActivity : AppCompatActivity() {
    private val prefs by lazy { ServerPrefs(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (20 * resources.displayMetrics.density).toInt()
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, pad, pad, pad / 2) }
        root.addView(TextView(this).apply { text = "Widget"; textSize = 18f })

        fun slider(label: String, max: Int, value: Int, show: (Int) -> String, onChange: (Int) -> Unit) {
            val caption = TextView(this).apply { text = "$label: ${show(value)}"; setPadding(0, pad / 2, 0, 0) }
            val bar = SeekBar(this).apply {
                this.max = max; progress = value
                setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                    override fun onProgressChanged(s: SeekBar, p: Int, fromUser: Boolean) { caption.text = "$label: ${show(p)}" }
                    override fun onStartTrackingTouch(s: SeekBar) {}
                    override fun onStopTrackingTouch(s: SeekBar) { onChange(s.progress); TasksWidgetProvider.redraw(applicationContext) }
                })
            }
            root.addView(caption); root.addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        // zoom 0.8 .. 1.8 in steps of 0.1 (0..10), spacing 0 .. 20 dp
        slider("Text size", 10, Math.round((prefs.widgetZoom - 0.8f) * 10f), { "${80 + it * 10}%" }) { prefs.widgetZoom = 0.8f + it / 10f }
        slider("Space between items", 20, prefs.widgetSpacing, { "$it dp" }) { prefs.widgetSpacing = it }

        root.addView(TextView(this).apply { text = "Order"; setPadding(0, pad / 2, 0, 0) })
        val group = RadioGroup(this)
        for ((key, label) in WidgetData.SORTS) {
            group.addView(RadioButton(this).apply { text = label; tag = key; id = android.view.View.generateViewId(); isChecked = prefs.widgetSort == key })
        }
        group.setOnCheckedChangeListener { g, checked ->
            prefs.widgetSort = g.findViewById<RadioButton>(checked)?.tag as? String ?: "manual"
            TasksWidgetProvider.redraw(applicationContext)
        }
        root.addView(group)

        val open = Button(this).apply { text = "Open TurboKeep"; setOnClickListener { startActivity(Intent(this@WidgetSettingsActivity, MainActivity::class.java)); finish() } }
        val done = Button(this).apply { text = "Done"; setOnClickListener { finish() } }
        root.addView(LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = android.view.Gravity.END; addView(open); addView(done) })
        setContentView(root)
    }
}
