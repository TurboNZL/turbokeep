package app.turbokeep.android

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import org.json.JSONArray
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** The home-screen widget: your open tasks (soonest first), a button to tick each one off, and buttons to add a task or a note. */
class TasksWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        for (id in ids) draw(context, manager, id)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) refreshAll(context)
    }

    companion object {
        const val ACTION_REFRESH = "app.turbokeep.android.REFRESH"
        private const val IMMUTABLE = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT

        private fun open(ctx: Context, code: Int, i: Intent) = PendingIntent.getActivity(ctx, code, i, IMMUTABLE)

        fun draw(ctx: Context, manager: AppWidgetManager, id: Int) {
            val v = RemoteViews(ctx.packageName, R.layout.widget_tasks)
            val adapter = Intent(ctx, TasksWidgetService::class.java).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
            adapter.data = Uri.parse(adapter.toUri(Intent.URI_INTENT_SCHEME))
            v.setRemoteAdapter(R.id.list, adapter)
            v.setEmptyView(R.id.list, R.id.empty)
            v.setTextViewText(R.id.empty, if (ServerPrefs(ctx).signedIn) "Nothing to do. Tap + to add a task." else "Open TurboKeep and sign in, then this list fills.")

            v.setOnClickPendingIntent(R.id.title, open(ctx, 1, Intent(ctx, MainActivity::class.java)))
            v.setOnClickPendingIntent(R.id.add_task, open(ctx, 2, Intent(ctx, QuickAddActivity::class.java).putExtra(QuickAddActivity.EXTRA_MODE, "task")))
            v.setOnClickPendingIntent(R.id.add_note, open(ctx, 3, Intent(ctx, QuickAddActivity::class.java).putExtra(QuickAddActivity.EXTRA_MODE, "note")))
            v.setOnClickPendingIntent(R.id.refresh, PendingIntent.getBroadcast(ctx, 4, Intent(ctx, TasksWidgetProvider::class.java).setAction(ACTION_REFRESH), IMMUTABLE))
            // one template for every row; each row adds what it is (tick or open) and which note
            val template = Intent(ctx, WidgetActionActivity::class.java)
            v.setPendingIntentTemplate(R.id.list, PendingIntent.getActivity(ctx, 5, template, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE))
            manager.updateAppWidget(id, v)
        }

        /** Draw the frames again and reload the list from the server. */
        fun refreshAll(ctx: Context) {
            val manager = AppWidgetManager.getInstance(ctx)
            val ids = manager.getAppWidgetIds(ComponentName(ctx, TasksWidgetProvider::class.java))
            if (ids.isEmpty()) return
            for (id in ids) draw(ctx, manager, id)
            manager.notifyAppWidgetViewDataChanged(ids, R.id.list)
        }
    }
}

class TasksWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = Factory(applicationContext)

    private class Row(val id: String, val title: String, val meta: String, val overdue: Boolean)

    private class Factory(private val ctx: Context) : RemoteViewsFactory {
        private var rows: List<Row> = emptyList()

        override fun onCreate() {}
        override fun onDestroy() {}
        override fun onDataSetChanged() { rows = load() }
        override fun getCount() = rows.size
        override fun getLoadingView(): RemoteViews? = null
        override fun getViewTypeCount() = 1
        override fun getItemId(position: Int) = rows[position].id.hashCode().toLong()
        override fun hasStableIds() = true

        override fun getViewAt(position: Int): RemoteViews {
            val r = rows[position]
            val v = RemoteViews(ctx.packageName, R.layout.widget_item)
            v.setTextViewText(R.id.item_title, r.title)
            v.setTextViewText(R.id.item_meta, r.meta)
            v.setViewVisibility(R.id.item_meta, if (r.meta.isEmpty()) android.view.View.GONE else android.view.View.VISIBLE)
            v.setTextColor(R.id.item_meta, ctx.getColor(if (r.overdue) R.color.widget_bad else R.color.widget_muted))
            v.setOnClickFillInIntent(R.id.check, Intent().putExtra(WidgetActionActivity.EXTRA_OP, "done").putExtra(WidgetActionActivity.EXTRA_ID, r.id))
            v.setOnClickFillInIntent(R.id.body, Intent().putExtra(WidgetActionActivity.EXTRA_OP, "open").putExtra(WidgetActionActivity.EXTRA_ID, r.id))
            return v
        }

        private fun load(): List<Row> {
            return try {
                val res = KeepApi.call(ctx, "GET", "/api/notes?kind=tasks&done=false")
                if (!res.ok) return emptyList()
                val a = JSONArray(res.body)
                val today = LocalDate.now()
                val out = ArrayList<Row>()
                for (i in 0 until minOf(a.length(), 60)) {
                    val n = a.getJSONObject(i)
                    val t = n.optJSONObject("task")
                    val title = n.optString("title").trim().ifEmpty { n.optString("text").trim().lineSequence().firstOrNull()?.take(80) ?: "" }.ifEmpty { "Untitled" }
                    val due = t?.optString("dueDate", "").orEmpty().ifEmpty { null }
                    var meta = ""; var overdue = false
                    if (due != null) {
                        val d = runCatching { java.time.Instant.parse(due).atZone(ZoneId.systemDefault()).toLocalDate() }.getOrNull()
                        if (d != null) {
                            overdue = d.isBefore(today)
                            meta = when {
                                d == today -> "Today"
                                d == today.plusDays(1) -> "Tomorrow"
                                d.isBefore(today) -> "Overdue " + d.format(DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH))
                                else -> d.format(DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH))
                            }
                        }
                    }
                    out.add(Row(n.getString("id"), title, meta, overdue))
                }
                out
            } catch (e: Exception) { emptyList() }
        }
    }
}
