// What the two content sections are CALLED on screen.
//
// The stored values are still "play" and "archive" everywhere — in the
// database, in the API, in every URL. Only the wording people read
// changed (Nov 2026: Plays -> Contemporary, Archive -> Heritage), so
// anywhere a raw section value would otherwise be printed, run it
// through sectionLabel() instead of renaming the value itself.
export const SECTION_LABELS = {
  play: "Contemporary",
  archive: "Heritage",
  both: "Both",
};

export function sectionLabel(value) {
  if (!value) return "";
  return SECTION_LABELS[value] || value;
}
