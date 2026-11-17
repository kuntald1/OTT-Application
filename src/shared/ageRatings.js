// The age ratings a video can carry, weakest first. Mirrors AgeRating in
// backend/app/models.py and ALLOWED_AGE_RATINGS in routers/videos.py —
// keep the three in step.
//
// Which of these are actually off limits to under-18 profiles is NOT
// decided here. That is a setting an admin edits (Admin > Age
// Restriction) and the server enforces; see backend/app/age_gate.py.
// Nothing in the frontend should ever decide who may watch what.
export const AGE_RATINGS = ["U", "UA7+", "UA13+", "UA16+", "A"];

// "A" is the certificate code; "18+" is what people actually read. The
// stored value stays "A" everywhere — this is display only.
const LABELS = { A: "18+" };

export function ageRatingLabel(value) {
  if (!value) return "";
  return LABELS[value] || value;
}

// For the Dropdown component's `labels` prop, where the longer form
// helps whoever is choosing a rating for a video they are uploading.
export const AGE_RATING_DROPDOWN_LABELS = { A: "A (18+)" };
