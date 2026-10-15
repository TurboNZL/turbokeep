package app.turbokeep.android

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import android.widget.Toast

/**
 * The home-screen widget: your Home list in your own order. Refresh on the left, the title in the middle (tap it for text size, spacing and order),
 * + on the right. Tap an item and it opens up a little: its description and two big buttons, Complete and Save to memory (which opens the app so you can
 * file it under tags). The checkbox on the left finishes it straight away.
 */
class TasksWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        for (id in ids) draw(context, manager, id)
        refreshInBackground(context)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action != ACTION_REFRESH) return
        // the button always does something and always says what happened, even when the list is empty or the server cannot be reached
        val pending = goAsync()
        toast(context, "Refreshing…")
        Thread {
            val ok = WidgetData.fetch(context)
            redraw(context)
            toast(context, if (ok) "Updated" else if (ServerPrefs(context).signedIn) "Could not reach the server" else "Open TurboKeep and sign in first")
            pending.finish()
        }.start()
    }

    companion object {
        const val ACTION_REFRESH = "app.turbokeep.android.REFRESH"
        private const val IMMUTABLE = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT

        private fun open(ctx: Context, code: Int, i: Intent) = PendingIntent.getActivity(ctx, code, i, IMMUTABLE)
        private fun toast(ctx: Context, text: String) = Handler(Looper.getMainLooper()).post { Toast.makeText(ctx.applicationContext, text, Toast.LENGTH_SHORT).show() }

        /** The frame: the three header buttons, the empty message, the list's adapter and the tap template for the rows. */
        fun draw(ctx: Context, manager: AppWidgetManager, id: Int) {
            val prefs = ServerPrefs(ctx)
            val v = RemoteViews(ctx.packageName, R.layout.widget_tasks)
            val adapter = Intent(ctx, TasksWidgetService::class.java).putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
            adapter.data = Uri.parse(adapter.toUri(Intent.URI_INTENT_SCHEME))
            v.setRemoteAdapter(R.id.list, adapter)
            v.setEmptyView(R.id.list, R.id.empty)
            v.setTextViewText(R.id.empty, if (prefs.signedIn) "Nothing on your list. Tap + to add something." else "Open TurboKeep and sign in, then this list fills.")
            v.setTextViewTextSize(R.id.title, TypedValue.COMPLEX_UNIT_SP, 16f * prefs.widgetZoom.coerceAtMost(1.3f))
            v.setTextViewTextSize(R.id.empty, TypedValue.COMPLEX_UNIT_SP, 14f * prefs.widgetZoom)

            v.setOnClickPendingIntent(R.id.title, open(ctx, 1, Intent(ctx, WidgetSettingsActivity::class.java)))
            v.setOnClickPendingIntent(R.id.add, open(ctx, 2, Intent(ctx, QuickAddActivity::class.java)))
            v.setOnClickPendingIntent(R.id.refresh, PendingIntent.getBroadcast(ctx, 4, Intent(ctx, TasksWidgetProvider::class.java).setAction(ACTION_REFRESH), IMMUTABLE))
            // one template for every row; each row adds what it is (tick, open up, save to memory) and which item
            val template = Intent(ctx, WidgetActionActivity::class.java)
            v.setPendingIntentTemplate(R.id.list, PendingIntent.getActivity(ctx, 5, template, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE))
            manager.updateAppWidget(id, v)
        }

        private fun ids(ctx: Context): IntArray = AppWidgetManager.getInstance(ctx).getAppWidgetIds(ComponentName(ctx, TasksWidgetProvider::class.java))

        /** Draws the frame and the rows again from what is kept (nothing is asked of the server). Used after a setting or a tap changed how things look. */
        fun redraw(ctx: Context) {
            val manager = AppWidgetManager.getInstance(ctx)
            val all = ids(ctx)
            if (all.isEmpty()) return
            for (id in all) draw(ctx, manager, id)
            manager.notifyAppWidgetViewDataChanged(all, R.id.list)
        }

        /** Asks the server, then redraws. Called when something changed in the app or after the widget itself changed something. */
        fun refreshInBackground(ctx: Context) {
            val app = ctx.applicationContext
            Thread { WidgetData.fetch(app); redraw(app) }.start()
        }

        /** What the app's page calls (through the bridge) when an item changed. */
        fun refreshAll(ctx: Context) = refreshInBackground(ctx)
    }
}

class TasksWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = Factory(applicationContext)

    private class Factory(private val ctx: Context) : RemoteViewsFactory {
        private var rows: List<WidgetData.Item> = emptyList()

        override fun onCreate() {}
        override fun onDestroy() {}
        override fun onDataSetChanged() {
            rows = WidgetData.cached(ctx)
            // nothing kept yet (the first time, or after a sign-in): ask once instead of showing an empty list
            if (rows.isEmpty() && ServerPrefs(ctx).signedIn && ServerPrefs(ctx).widgetCache == "[]") { WidgetData.fetch(ctx); rows = WidgetData.cached(ctx) }
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
            val open = prefs.widgetOpen == r.id
            val v = RemoteViews(ctx.packageName, R.layout.widget_item)
            val (meta, overdue) = WidgetData.meta(r)

            v.setTextViewText(R.id.item_title, r.title)
            v.setTextViewTextSize(R.id.item_title, TypedValue.COMPLEX_UNIT_SP, 14f * zoom)
            v.setInt(R.id.item_title, "setMaxLines", if (open) 6 else 2)
            v.setTextViewText(R.id.item_meta, meta)
            v.setTextViewTextSize(R.id.item_meta, TypedValue.COMPLEX_UNIT_SP, 11f * zoom)
            v.setViewVisibility(R.id.item_meta, if (meta.isEmpty()) View.GONE else View.VISIBLE)
            v.setTextColor(R.id.item_meta, ctx.getColor(if (overdue) R.color.widget_bad else R.color.widget_muted))
            // the space between items is the padding above and below each one
            val pad = ((6 + prefs.widgetSpacing) * density).toInt()
            v.setViewPadding(R.id.body, 0, pad / 2, (8 * density).toInt(), pad / 2)
            if (Build.VERSION.SDK_INT >= 31) { // the checkbox grows with the text where the system lets a widget resize a view
                v.setViewLayoutWidth(R.id.check, 44f * zoom, TypedValue.COMPLEX_UNIT_DIP)
                v.setViewLayoutHeight(R.id.check, 44f * zoom, TypedValue.COMPLEX_UNIT_DIP)
            }

            // opened up: the description and the two big buttons
            v.setViewVisibility(R.id.item_desc, if (open && r.text.isNotBlank()) View.VISIBLE else View.GONE)
            v.setTextViewText(R.id.item_desc, r.text.take(400))
            v.setTextViewTextSize(R.id.item_desc, TypedValue.COMPLEX_UNIT_SP, 12f * zoom)
            v.setViewVisibility(R.id.actions, if (open) View.VISIBLE else View.GONE)
            v.setTextViewTextSize(R.id.btn_done, TypedValue.COMPLEX_UNIT_SP, 14f * zoom)
            v.setTextViewTextSize(R.id.btn_memory, TypedValue.COMPLEX_UNIT_SP, 14f * zoom)

            fun op(name: String) = Intent().putExtra(WidgetActionActivity.EXTRA_OP, name).putExtra(WidgetActionActivity.EXTRA_ID, r.id)
            v.setOnClickFillInIntent(R.id.check, op("done"))
            v.setOnClickFillInIntent(R.id.body, op("toggle"))
            v.setOnClickFillInIntent(R.id.btn_done, op("done"))
            v.setOnClickFillInIntent(R.id.btn_memory, op("memory"))
            return v
        }
    }
}
