package app.turbokeep.android

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import android.widget.Toast

/**
 * The list widget: your tasks in your own order, or the notes of one tag (chosen in the widget's settings). Nothing but items fills it; two small round
 * buttons float over the corners: open (top right) and refresh (bottom right, a spinner while it works). A tap on an item opens it up to fill the whole
 * widget, with two buttons floating over its text: Complete and Send to tags (for a tag's notes: Archive and Send to tasks). A tap on the opened text closes
 * it again; the app is only reached with the open button.
 */
class TasksWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        for (id in ids) draw(context, manager, id)
        WidgetRefresh.start(context, announce = false)
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        val prefs = ServerPrefs(context)
        for (id in ids) prefs.forgetWidget(id)
    }

    /** the widget was made bigger or smaller: an opened item shows as many lines as fit */
    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, newOptions: Bundle) = draw(context, manager, id)

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action != ACTION_REFRESH) return
        // the button always does something and always says what happened, even when the list is empty or the server cannot be reached
        val pending = goAsync()
        WidgetRefresh.start(context, announce = true) { pending.finish() }
    }

    companion object {
        const val ACTION_REFRESH = "app.turbokeep.android.REFRESH"
        private const val IMMUTABLE = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT

        // a different request code for every widget and button, so each one keeps its own extras
        fun code(id: Int, button: Int) = id * 16 + button
        fun activity(ctx: Context, id: Int, button: Int, i: Intent): PendingIntent = PendingIntent.getActivity(ctx, code(id, button), i, IMMUTABLE)
        fun refreshIntent(ctx: Context, id: Int, provider: Class<*>): PendingIntent =
            PendingIntent.getBroadcast(ctx, code(id, 4), Intent(ctx, provider).setAction(ACTION_REFRESH), IMMUTABLE)

        /** the intent that opens the widget's settings (as a small window) for one widget */
        fun settingsIntent(ctx: Context, id: Int): Intent =
            Intent(ctx, WidgetSettingsActivity::class.java).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id).setData(Uri.parse("tkwidget://settings/$id"))

        fun toast(ctx: Context, text: String) = Handler(Looper.getMainLooper()).post { Toast.makeText(ctx.applicationContext, text, Toast.LENGTH_SHORT).show() }

        /** how many lines of text fit in the opened item (from the widget's size on the home screen) */
        private fun linesFor(ctx: Context, manager: AppWidgetManager, id: Int, zoom: Float): Int {
            val h = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 160)
            val lineDp = 13f * zoom * 1.3f
            return ((h - 90f) / lineDp).toInt().coerceIn(1, 60)
        }

        /** The frame: the buttons, the empty message, the list's adapter and the tap template for the rows; or, while an item is open, that item over the whole widget. */
        fun draw(ctx: Context, manager: AppWidgetManager, id: Int) {
            val prefs = ServerPrefs(ctx)
            val tag = prefs.widgetTag(id)
            val zoom = prefs.widgetZoom
            val v = RemoteViews(ctx.packageName, R.layout.widget_tasks)

            val openId = prefs.widgetOpen(id)
            val item = if (openId.isEmpty()) null else WidgetData.cached(ctx, tag).firstOrNull { it.id == openId }
            if (openId.isNotEmpty() && item == null) prefs.setWidgetOpen(id, "") // it is gone (finished elsewhere)

            if (item != null) {
                v.setViewVisibility(R.id.list_area, View.GONE)
                v.setViewVisibility(R.id.detail_area, View.VISIBLE)
                val (meta, _) = WidgetData.meta(item)
                v.setTextViewText(R.id.detail_title, item.title)
                v.setTextViewTextSize(R.id.detail_title, TypedValue.COMPLEX_UNIT_SP, 17f * zoom)
                v.setTextViewText(R.id.detail_meta, meta)
                v.setViewVisibility(R.id.detail_meta, if (meta.isEmpty()) View.GONE else View.VISIBLE)
                v.setTextViewTextSize(R.id.detail_meta, TypedValue.COMPLEX_UNIT_SP, 11f * zoom)
                v.setTextViewText(R.id.detail_desc, item.text.ifBlank { "No description." })
                v.setTextViewTextSize(R.id.detail_desc, TypedValue.COMPLEX_UNIT_SP, 13f * zoom)
                v.setInt(R.id.detail_desc, "setMaxLines", linesFor(ctx, manager, id, zoom))
                v.setTextViewText(R.id.detail_done, if (tag.isEmpty()) "Complete" else "Archive")
                v.setTextViewText(R.id.detail_send, if (tag.isEmpty()) "Send to tags" else "Send to tasks")
                fun op(name: String) = Intent(ctx, WidgetActionActivity::class.java).setData(Uri.parse("tkwidget://action/$id/$name"))
                    .putExtra(WidgetActionActivity.EXTRA_OP, name).putExtra(WidgetActionActivity.EXTRA_ID, item.id).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
                v.setOnClickPendingIntent(R.id.detail_text, activity(ctx, id, 6, op("collapse")))
                v.setOnClickPendingIntent(R.id.detail_done, activity(ctx, id, 7, op("done")))
                v.setOnClickPendingIntent(R.id.detail_send, activity(ctx, id, 8, op(if (tag.isEmpty()) "tags" else "tasks")))
                manager.updateAppWidget(id, v)
                return
            }

            v.setViewVisibility(R.id.list_area, View.VISIBLE)
            v.setViewVisibility(R.id.detail_area, View.GONE)
            val adapter = Intent(ctx, TasksWidgetService::class.java).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
            adapter.data = Uri.parse(adapter.toUri(Intent.URI_INTENT_SCHEME))
            v.setRemoteAdapter(R.id.list, adapter)
            v.setEmptyView(R.id.list, R.id.empty)
            v.setTextViewText(R.id.empty, when {
                !prefs.signedIn -> "Open TurboKeep and sign in, then this list fills."
                tag.isEmpty() -> "Nothing on your list."
                else -> "Nothing under “${tag.substringAfterLast('.')}” yet."
            })
            v.setTextViewTextSize(R.id.empty, TypedValue.COMPLEX_UNIT_SP, 14f * zoom.coerceAtLeast(0.8f))

            // open: the widget's settings first (they have an Open TurboKeep button), or straight into the app when that is turned off there
            val openIntent = if (prefs.openShowsSettings) settingsIntent(ctx, id) else Intent(ctx, MainActivity::class.java).setData(Uri.parse("tkwidget://open/$id"))
            v.setOnClickPendingIntent(R.id.open, activity(ctx, id, 1, openIntent))
            v.setOnClickPendingIntent(R.id.refresh, refreshIntent(ctx, id, TasksWidgetProvider::class.java))
            v.setViewVisibility(R.id.refresh, if (prefs.refreshing) View.GONE else View.VISIBLE)
            v.setViewVisibility(R.id.refresh_spin, if (prefs.refreshing) View.VISIBLE else View.GONE)
            // one template for every row; each row adds what it is (open it up) and which item
            val template = Intent(ctx, WidgetActionActivity::class.java).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
            v.setPendingIntentTemplate(R.id.list, PendingIntent.getActivity(ctx, code(id, 5), template, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE))
            manager.updateAppWidget(id, v)
        }

        fun ids(ctx: Context): IntArray = AppWidgetManager.getInstance(ctx).getAppWidgetIds(ComponentName(ctx, TasksWidgetProvider::class.java))

        /** Draws the frame and the rows again from what is kept (nothing is asked of the server). Used after a setting or a tap changed how things look. */
        fun redraw(ctx: Context) {
            val manager = AppWidgetManager.getInstance(ctx)
            val all = ids(ctx)
            if (all.isEmpty()) return
            for (id in all) draw(ctx, manager, id)
            manager.notifyAppWidgetViewDataChanged(all, R.id.list)
        }

        /** Asks the server, then redraws. Called when something changed in the app or after the widget itself changed something. */
        fun refreshInBackground(ctx: Context) = WidgetRefresh.start(ctx, announce = false)

        /** What the app's page calls (through the bridge) when an item changed. */
        fun refreshAll(ctx: Context) = refreshInBackground(ctx)
    }
}

/** Refreshing every widget (lists and notes): one place, so the spinner, the toast and the redraw are the same everywhere. */
object WidgetRefresh {
    /** `announce`: say how it went in a toast (the refresh button). `done` runs when everything is finished. */
    fun start(ctx: Context, announce: Boolean, done: (() -> Unit)? = null) {
        val app = ctx.applicationContext
        val prefs = ServerPrefs(app)
        prefs.refreshing = true
        redrawAll(app)
        Thread {
            val ok = fetchAll(app)
            prefs.refreshing = false
            redrawAll(app)
            if (announce) TasksWidgetProvider.toast(app, if (ok) "Updated" else if (prefs.signedIn) "Could not reach the server" else "Open TurboKeep and sign in first")
            done?.invoke()
        }.start()
    }

    fun redrawAll(ctx: Context) { TasksWidgetProvider.redraw(ctx); NoteWidgetProvider.redraw(ctx) }

    /** every list in use (tasks and each tag some widget shows) and every note some widget shows. True when all answered. */
    private fun fetchAll(ctx: Context): Boolean {
        val prefs = ServerPrefs(ctx)
        val tags = TasksWidgetProvider.ids(ctx).map { prefs.widgetTag(it) }.toSet()
        val notes = NoteWidgetProvider.ids(ctx).map { prefs.noteOf(it) }.filter { it.isNotEmpty() }.toSet()
        var ok = true
        for (t in tags) if (!WidgetData.fetch(ctx, t)) ok = false
        for (n in notes) if (!WidgetData.fetchNote(ctx, n)) ok = false
        return ok
    }
}

class TasksWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = Factory(applicationContext, intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID))

    private class Factory(private val ctx: Context, private val widgetId: Int) : RemoteViewsFactory {
        private var rows: List<WidgetData.Item> = emptyList()
        private var tag = ""

        override fun onCreate() {}
        override fun onDestroy() {}
        override fun onDataSetChanged() {
            tag = ServerPrefs(ctx).widgetTag(widgetId)
            rows = WidgetData.cached(ctx, tag)
            // nothing kept yet (the first time, or after a sign-in): ask once instead of showing an empty list
            if (rows.isEmpty() && ServerPrefs(ctx).signedIn && !WidgetData.known(ctx, tag)) { WidgetData.fetch(ctx, tag); rows = WidgetData.cached(ctx, tag) }
        }
        override fun getCount() = rows.size
        override fun getLoadingView(): RemoteViews? = null
        override fun getViewTypeCount() = 1
        override fun getItemId(position: Int) = rows[position].id.hashCode().toLong()
        override fun hasStableIds() = true

        override fun getViewAt(position: Int): RemoteViews {
            val r = rows[position]
            val prefs = ServerPrefs(ctx)
            val zoom = prefs.widgetZoom
            val density = ctx.resources.displayMetrics.density
            val v = RemoteViews(ctx.packageName, R.layout.widget_item)
            val (meta, overdue) = WidgetData.meta(r)

            v.setTextViewText(R.id.item_title, r.title)
            v.setTextViewTextSize(R.id.item_title, TypedValue.COMPLEX_UNIT_SP, 14f * zoom)
            v.setTextViewText(R.id.item_meta, meta)
            v.setTextViewTextSize(R.id.item_meta, TypedValue.COMPLEX_UNIT_SP, 11f * zoom)
            v.setViewVisibility(R.id.item_meta, if (meta.isEmpty()) View.GONE else View.VISIBLE)
            v.setTextColor(R.id.item_meta, ctx.getColor(if (overdue) R.color.widget_bad else R.color.widget_muted))
            // Space between items: above 0 it is room around each card; below 0 the cards lose their own padding (a list cannot overlap its rows, so at the
            // lowest setting they touch with no padding at all) and the text sits tighter.
            val gap = prefs.widgetSpacing
            val outer = if (gap > 0) gap / 2f else 0f
            val inner = if (gap >= 0) 5f * zoom.coerceAtMost(1.2f) else (5f + gap * 0.5f).coerceAtLeast(0f) * zoom.coerceAtMost(1.2f)
            v.setViewPadding(R.id.outer, 0, (outer * density).toInt(), 0, (outer * density).toInt())
            v.setViewPadding(R.id.card, (10 * density).toInt(), (inner * density).toInt(), (10 * density).toInt(), (inner * density).toInt())

            // a tap opens the item up over the whole widget
            v.setOnClickFillInIntent(R.id.card, Intent().putExtra(WidgetActionActivity.EXTRA_OP, "open").putExtra(WidgetActionActivity.EXTRA_ID, r.id))
            return v
        }
    }
}
