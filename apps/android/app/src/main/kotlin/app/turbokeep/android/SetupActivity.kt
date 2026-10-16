package app.turbokeep.android

import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

/** Where is your TurboKeep? Asked on the first start, and again from Settings > This app > Change server. Nothing is saved until the address answers. */
class SetupActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val prefs = ServerPrefs(this)
        val d = resources.displayMetrics.density
        fun px(n: Int) = (n * d).toInt()
        fun label(t: String, size: Float = 14f) = TextView(this).apply { text = t; textSize = size; setTextColor(0xFFE8E8EE.toInt()); setPadding(0, px(14), 0, px(4)) }
        fun field(hint: String, value: String, type: Int = InputType.TYPE_CLASS_TEXT) = EditText(this).apply {
            this.hint = hint; setText(value); inputType = type or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS; setSingleLine()
            setTextColor(0xFFF2F2F5.toInt()); setHintTextColor(0xFF77778A.toInt())
        }
        val url = field("https://keep.example.com or http://192.168.1.20:47901", prefs.serverUrl, InputType.TYPE_TEXT_VARIATION_URI)
        val cfId = field("Client ID (optional)", prefs.cfId)
        val cfSecret = field("Client Secret (optional)", prefs.cfSecret, InputType.TYPE_TEXT_VARIATION_PASSWORD)
        val pairing = field("Pairing code (optional)", "")
        val useCode = Button(this).apply { text = "Use code" }
        var pairedToken = ""
        val message = TextView(this).apply { setTextColor(0xFFFF6B5E.toInt()); setPadding(0, px(10), 0, 0) }
        val connect = Button(this).apply { text = "Connect" }
        var forced = "" // the address, id and secret the check failed for: pressing Connect again with the same ones saves them anyway
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(px(22), px(22), px(22), px(22))
            addView(TextView(context).apply { text = "TurboKeep"; textSize = 26f; setTextColor(0xFFFFFFFF.toInt()) })
            addView(label("Your server's address. You sign in on the next screen.", 15f))
            addView(url, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            addView(label("Have a pairing code? On the web page: Settings > This app > Pair a phone. Paste it here and everything below is filled in."))
            addView(pairing, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            addView(useCode)
            addView(label("Only if the server is behind Cloudflare Access: a service token (Zero Trust > Access > Service Auth). The widget uses it when its sign-in cookie runs out."))
            addView(cfId, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            addView(cfSecret, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            addView(message)
            addView(connect)
        }
        val scroll = ScrollView(this).apply { setBackgroundColor(0xFF0B0B10.toInt()); addView(box) }
        setContentView(scroll)
        ViewCompat.setOnApplyWindowInsetsListener(scroll) { v, insets ->
            val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(b.left, b.top, b.right, b.bottom); WindowInsetsCompat.CONSUMED
        }

        useCode.setOnClickListener {
            val p = PairCode.decode(pairing.text.toString())
            if (p == null) { message.setTextColor(0xFFFF6B5E.toInt()); message.text = "That is not a TurboKeep pairing code. It starts with ${PairCode.PREFIX}"; return@setOnClickListener }
            if (p.url.isNotEmpty()) url.setText(p.url)
            cfId.setText(p.cfId); cfSecret.setText(p.cfSecret); pairedToken = p.token; pairing.setText("")
            message.setTextColor(0xFF9A9AA5.toInt()); message.text = "Code accepted. Press Connect."
        }

        connect.setOnClickListener {
            var address = url.text.toString().trim().trimEnd('/')
            if (address.isEmpty()) { message.text = "Type the address first."; return@setOnClickListener }
            if (!address.startsWith("http://") && !address.startsWith("https://")) address = "https://$address"
            message.setTextColor(0xFF9A9AA5.toInt()); message.text = "Checking…"; connect.isEnabled = false
            val id = cfId.text.toString().trim(); val secret = cfSecret.text.toString().trim()
            // TurboMusic does not gate saving on a check: it saves what you typed and lets the real requests show whether it works. The check here only advises:
            // when it fails, the next press of the button (now "Connect anyway") saves the same address and token and opens the page.
            fun save() {
                // a different server means the old token is no good
                if (prefs.serverUrl != address) prefs.token = ""
                prefs.serverUrl = address; prefs.cfId = id; prefs.cfSecret = secret
                if (pairedToken.isNotEmpty()) prefs.token = pairedToken // from a pairing code: the widget can talk to the server at once
                setResult(Activity.RESULT_OK); finish()
            }
            if (forced == address + "|" + id + "|" + secret) { save(); return@setOnClickListener }
            Thread {
                val problem = KeepApi.probe(address, id, secret)
                Handler(Looper.getMainLooper()).post {
                    connect.isEnabled = true
                    if (problem != null) {
                        forced = address + "|" + id + "|" + secret
                        connect.text = "Connect anyway"
                        message.setTextColor(0xFFFF6B5E.toInt())
                        message.text = problem + "\n\nThe check can be wrong. Press Connect anyway to use these settings: the app's page will show whether it works."
                    } else save()
                }
            }.start()
        }
    }
}
