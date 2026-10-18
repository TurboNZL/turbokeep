/** The items just made on this page: their row plays the "arrive" animation once, when it first appears (a row that is only scrolled into view, reloaded or remounted by a tab switch does not). */
const fresh = new Map<string, number>();
const WINDOW = 1500; // long enough for the row to be built (React may build it twice in development), short enough that coming back to the page does not replay it
export const markFresh = (id: string) => { fresh.set(id, Date.now() + WINDOW); setTimeout(() => fresh.delete(id), WINDOW); };
export const takeFresh = (id: string) => (fresh.get(id) ?? 0) > Date.now(); // not deleted here: React may build a row twice in development
