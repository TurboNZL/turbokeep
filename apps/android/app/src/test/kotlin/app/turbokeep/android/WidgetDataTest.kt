package app.turbokeep.android

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class WidgetDataTest {
    private val zone = ZoneId.of("UTC")

    private fun note(id: String, title: String, pos: Double, pinned: Boolean = false, due: String? = null, percent: Double = 0.0, onList: Boolean = true, archived: Boolean = false, text: String = ""): JSONObject =
        JSONObject().put("id", id).put("title", title).put("text", text).put("onList", onList).put("archived", archived).put("trashed", false)
            .put("pinned", pinned).put("position", pos).put("createdAt", "2026-10-0${id}T00:00:00Z").put("percentDone", percent).apply { if (due != null) put("dueDate", due) }
    private fun json(vararg n: JSONObject) = JSONArray(n.toList()).toString()
    private fun titles(items: List<WidgetData.Item>) = items.map { it.title }

    @Test fun readsOnlyWhatIsOnTheListAndNotFinished() {
        val items = WidgetData.parse(json(note("1", "Milk", 1.0), note("2", "A note", 2.0, onList = false), note("3", "Done", 3.0, archived = true)), zone)
        assertEquals(listOf("Milk"), titles(items))
    }

    @Test fun anUntitledItemUsesItsFirstLineAndTheRestIsTheDescription() {
        val items = WidgetData.parse(json(note("1", "", 1.0, text = "Call the bank\nabout the card")), zone)
        assertEquals("Call the bank", items[0].title)
        assertEquals("about the card", items[0].text)
    }

    @Test fun myOrderKeepsThePositionsAndPutsPinnedFirst() {
        val items = WidgetData.parse(json(note("1", "b", 2.0), note("2", "a", 1.0), note("3", "c", 3.0, pinned = true)), zone)
        assertEquals(listOf("c", "a", "b"), titles(WidgetData.sorted(items, "manual")))
    }

    @Test fun otherOrders() {
        val items = WidgetData.parse(json(note("1", "banana", 1.0, due = "2026-10-20T00:00:00Z"), note("2", "Apple", 2.0), note("3", "cherry", 3.0, due = "2026-10-10T00:00:00Z")), zone)
        assertEquals(listOf("cherry", "banana", "Apple"), titles(WidgetData.sorted(items, "due")))
        assertEquals(listOf("Apple", "banana", "cherry"), titles(WidgetData.sorted(items, "title")))
        assertEquals(listOf("cherry", "Apple", "banana"), titles(WidgetData.sorted(items, "newest")))
    }

    @Test fun labelsDatesAndProgress() {
        val today = LocalDate.of(2026, 10, 15)
        val items = WidgetData.parse(json(
            note("1", "a", 1.0, due = "2026-10-15T09:00:00Z"), note("2", "b", 2.0, due = "2026-10-16T09:00:00Z"),
            note("3", "c", 3.0, due = "2026-10-03T09:00:00Z"), note("4", "d", 4.0, percent = 0.5)), zone)
        assertEquals("Today" to false, WidgetData.meta(items[0], today))
        assertEquals("Tomorrow" to false, WidgetData.meta(items[1], today))
        assertEquals("Overdue 3 Oct" to true, WidgetData.meta(items[2], today))
        assertEquals("50%" to false, WidgetData.meta(items[3], today))
    }
}
