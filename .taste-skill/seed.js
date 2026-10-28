// Dev-only sample data for screenshots. Paste this function into a Playwright
// `browser_evaluate` on http://127.0.0.1:5180/#today (dev server only: it
// imports the app's own module graph, so it writes through the same Container
// the app uses). Six cycles of 27–30 days ending 17 days before today, with
// symptoms, moods, energy, notes and a few medications. Reloads when done.
async () => {
  const { container } = await import("/src/app/di/context.ts");
  const { toDateKey, addDays } = await import("/src/domain/dates.ts");
  const today = new Date();
  const lengths = [29, 28, 30, 27, 29, 28];
  const periods = [5, 5, 6, 5, 4, 5];
  let start = addDays(today, -17);
  const starts = [start];
  for (let i = lengths.length - 1; i > 0; i--) { start = addDays(start, -lengths[i]); starts.unshift(start); }
  const flows = ["heavy", "heavy", "medium", "light", "spotting", "spotting"];
  const pick = (arr, i) => arr[i % arr.length];
  const symptomSets = [["Cramps", "Fatigue", "Back pain"], ["Cramps", "Bloating"], ["Headache"], ["Acne"], ["Bloating", "Food cravings", "Breast tenderness"], ["Mood swings", "Irritability"], ["Insomnia"]];
  const moods = ["Hopeful", "Calm", "Energetic", "Confident", "Focused", "Sensitive", "Irritable", "Content"];
  const logs = [];
  starts.forEach((s, c) => {
    for (let d = 0; d < periods[c]; d++) {
      logs.push({ date: toDateKey(addDays(s, d)), flow: flows[d], symptoms: pick(symptomSets, c + d).slice(), mood: d === 0 ? "Tearful" : pick(moods, c + d), energy: d < 2 ? "low" : "medium", notes: d === 0 ? "Started in the morning." : "", ...(d === 0 ? { medication: [{ name: "Ibuprofen", dose: "400mg" }] } : {}) });
    }
    for (const off of [9, 13, 20, 24]) {
      const date = addDays(s, off);
      if (date > today) continue;
      logs.push({ date: toDateKey(date), flow: "none", symptoms: pick(symptomSets, c + off).slice(), mood: pick(moods, c * 3 + off), energy: off < 15 ? "high" : "medium", notes: "" });
    }
  });
  logs.push({ date: toDateKey(today), flow: "none", symptoms: ["Bloating", "Fatigue"], mood: "Calm", energy: "medium", notes: "" });
  await container.saveLogs(logs, { mode: "merge-defined" });
  location.reload();
  return `${logs.length} days seeded`;
}
