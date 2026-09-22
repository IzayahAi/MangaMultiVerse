// Client-side Curator — the reader-facing mirror of the `curate` maintenance agent (api/maintenance.js).
// Builds the homepage shelves from the already-loaded published catalog, so the feed renders curated rows
// with NO extra API call and NO cost. (The agent additionally does Claude "staff picks" for the admin view;
// those aren't computed here to keep the public feed free + instant.) Same ranking as the agent so the two
// stay consistent.
export function buildShelves(stories = []) {
  const now = Date.now();
  const list = Array.isArray(stories) ? stories : [];
  const when = (s) => new Date(s.published_at || s.updated_at || s.created_at || 0).getTime();
  const trendScore = (s) =>
    (Number(s.rating) || 0) * 2 +
    (Number(s.views) || 0) * 0.01 +
    Math.max(0, 14 - (now - when(s)) / 864e5); // recency bonus tapering over ~2 weeks

  const trending = [...list].sort((a, b) => trendScore(b) - trendScore(a)).slice(0, 12);
  const fresh = [...list].sort((a, b) => when(b) - when(a)).slice(0, 12);

  const byGenre = {};
  list.forEach((s) => (s.genre_tags || []).forEach((g) => (byGenre[g] = byGenre[g] || []).push(s)));
  const genreShelves = Object.entries(byGenre)
    .filter(([, v]) => v.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 4)
    .map(([genre, items]) => ({ genre, items: items.slice(0, 12) }));

  return { trending, fresh, genreShelves };
}
