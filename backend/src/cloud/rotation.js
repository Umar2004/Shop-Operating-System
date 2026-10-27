// Which cloud copies to keep: the newest copy of each of the last 14 days, the last 8 weeks and the last 12 months
// (by the backup's own time, in the PC's time zone), plus always the newest copy. Everything else may be deleted.
// Pure function, so the rule is tested on its own.
const KEEP = { daily: 14, weekly: 8, monthly: 12 };

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
function weekKey(d) {
  // ISO week: the week belongs to the year of its Thursday
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (t.getDay() + 6) % 7; // Monday = 0
  t.setDate(t.getDate() - dow + 3);
  const dayOfYear = Math.round((t - new Date(t.getFullYear(), 0, 1)) / 86400000); // 0-based
  return `${t.getFullYear()}-W${pad(Math.floor(dayOfYear / 7) + 1)}`;
}

// files: [{ id, time: Date }]; returns { keep: Set(ids), remove: [ids] }
function selectKeep(files, keep = KEEP) {
  const sorted = [...files].sort((a, b) => b.time - a.time);
  const kept = new Set();
  const pick = (keyFn, limit) => {
    const seen = new Set();
    for (const f of sorted) {
      const k = keyFn(f.time);
      if (seen.has(k)) continue;
      if (seen.size >= limit) break;
      seen.add(k);
      kept.add(f.id); // the first one met for a period is its newest
    }
  };
  pick(dayKey, keep.daily);
  pick(weekKey, keep.weekly);
  pick(monthKey, keep.monthly);
  if (sorted[0]) kept.add(sorted[0].id);
  return { keep: kept, remove: sorted.filter((f) => !kept.has(f.id)).map((f) => f.id) };
}

module.exports = { selectKeep, KEEP, weekKey };
