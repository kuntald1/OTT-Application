// Fixed language choices for video uploads — a toggle list instead of
// free text, so values stay consistent everywhere they're stored,
// filtered, or displayed (no "hindi" vs "Hindi" vs "HINDI" drift).
export const LANGUAGE_OPTIONS = [
  { value: "English", label: "English" },
  { value: "Hindi", label: "Hindi (हिंदी)" },
  { value: "Bengali", label: "Bengali (বাংলা)" },
];
