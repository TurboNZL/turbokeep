package app.turbokeep.android

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import android.widget.RemoteViewsService

/**
 * The one-note widget: a single note (chosen when the widget is added, or later from its Reconfigure entry) as a list of lines, so a long note scrolls.
 * Top right opens the note in the app; bottom right refreshes (a spinner while it works).
 */
class NoteWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        for (id in ids) draw(context, manager, id)
        WidgetRefresh.start(context, announce = false)
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        val prefs = ServerPrefs(context)
        for (id in ids) prefs.forgetWidget(id)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action != TasksWidgetProvider.ACTION_REFRESH) return
        val pending = goAsync()
        WidgetRefresh.start(context, announce = true) { pending.finish() }
    }

    companion object {
        fun ids(ctx: Context): IntArray = AppWidgetManager.getInstance(ctx).getAppWidgetIds(ComponentName(ctx, NoteWidgetProvider::class.java))

        fun draw(ctx: Context, manager: AppWidgetManager, id: Int) {
            val prefs = ServerPrefs(ctx)
            val noteId = prefs.noteOf(id)
            val v = RemoteViews(ctx.packageName, R.layout.widget_note)
            val adapter = Intent(ctx, NoteWidgetService::class.java).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
            adapter.data = Uri.parse(adapter.toUri(Intent.URI_INTENT_SCHEME))
            v.setRemoteAdapter(R.id.list, adapter)
            v.setEmptyView(R.id.list, R.id.empty)
            v.setTextViewText(R.id.empty, when {
                !prefs.signedIn -> "Open TurboKeep and sign in, then this note shows."
                noteId.isEmpty() -> "Tap the open button to choose a note."
                else -> "This note could not be loaded. Tap refresh."
            })
            // open: the note in the app; with no note chosen yet, the choice
            val openIntent = if (noteId.isEmpty()) Intent(ctx, NoteWidgetConfigActivity::class.java).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id).setData(Uri.parse("tkwidget://choose/$id"))
                else Intent(ctx, MainActivity::class.java).putExtra(MainActivity.EXTRA_PATH, "/home/$noteId").setData(Uri.parse("tkwidget://note/$id"))
            v.setOnClickPendingIntent(R.id.open, TasksWidgetProvider.activity(ctx, id, 1, openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)))
            TasksWidgetProvider.styleButtons(ctx, v, R.drawable.ic_w_open, listOf(R.id.open, R.id.refresh, R.id.refresh_spin))
            v.setOnClickPendingIntent(R.id.refresh, TasksWidgetProvider.refreshIntent(ctx, id, NoteWidgetProvider::class.java))
            v.setViewVisibility(R.id.refresh, if (prefs.refreshing) View.GONE else View.VISIBLE)
            v.setViewVisibility(R.id.refresh_spin, if (prefs.refreshing) View.VISIBLE else View.GONE)
            manager.updateAppWidget(id, v)
        }

        fun redraw(ctx: Context) {
            val manager = AppWidgetManager.getInstance(ctx)
            val all = ids(ctx)
            if (all.isEmpty()) return
            for (id in all) draw(ctx, manager, id)
            manager.notifyAppWidgetViewDataChanged(all, R.id.list)
        }
    }
}

class NoteWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = Factory(applicationContext, intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID))

    private class Factory(private val ctx: Context, private val widgetId: Int) : RemoteViewsFactory {
        private var rows: List<WidgetData.Row> = emptyList()

        override fun onCreate() {}
        override fun onDestroy() {}
        override fun onDataSetChanged() {
            val noteId = ServerPrefs(ctx).noteOf(widgetId)
            if (noteId.isEmpty()) { rows = emptyList(); return }
            var note = WidgetData.cachedNote(ctx, noteId)
            if (note == null && ServerPrefs(ctx).signedIn) { WidgetData.fetchNote(ctx, noteId); note = WidgetData.cachedNote(ctx, noteId) }
            rows = note?.let { WidgetData.rows(it) } ?: emptyList()
        }
        override fun getCount() = rows.size
        override fun getLoadingView(): RemoteViews? = null
        override fun getViewTypeCount() = 2
        override fun getItemId(position: Int) = position.toLong()
        override fun hasStableIds() = false

        override fun getViewAt(position: Int): RemoteViews {
            val r = rows[position]
            val zoom = ServerPrefs(ctx).widgetZoom
            val v = RemoteViews(ctx.packageName, if (r.isTitle) R.layout.widget_note_title else R.layout.widget_note_row)
            v.setTextViewText(R.id.row_text, r.text)
            v.setTextViewTextSize(R.id.row_text, TypedValue.COMPLEX_UNIT_SP, (if (r.isTitle) 17f else 13f) * zoom)
            return v
        }
    }
}
