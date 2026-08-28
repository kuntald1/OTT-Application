import React, { useState } from "react";
import { Upload, Trash2 } from "lucide-react";

const COMMON_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "bn", label: "Bengali" },
  { code: "hi", label: "Hindi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "mr", label: "Marathi" },
  { code: "gu", label: "Gujarati" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "pa", label: "Punjabi" },
  { code: "ur", label: "Urdu" },
];

// ---------------------------------------------------------------------------
// SubtitleManager — language picker + file upload + a table of existing
// subtitles with delete, shared across every place a video's subtitles
// can be managed (creator's My Video List, Admin Add Video, Admin Video
// Review). addFn/deleteFn are passed in since creator vs admin hit
// different API endpoints.
// ---------------------------------------------------------------------------
export default function SubtitleManager({ video, addFn, deleteFn, onUpdated }) {
  const [languageCode, setLanguageCode] = useState("en");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const subtitles = video.subtitles || [];

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const label = COMMON_LANGUAGES.find((l) => l.code === languageCode)?.label || languageCode;
      const updated = await addFn(video.id, languageCode, label, file);
      onUpdated(updated);
    } catch (err) {
      setError(err.message || "Couldn't upload subtitle. Please try again.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (subtitleId) => {
    setError("");
    setDeletingId(subtitleId);
    try {
      const updated = await deleteFn(video.id, subtitleId);
      onUpdated(updated);
    } catch (err) {
      setError(err.message || "Couldn't delete subtitle. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase" style={{ color: "rgba(245,235,221,0.5)" }}>Subtitles</p>

      {subtitles.length > 0 && (
        <div className="mb-2 overflow-hidden rounded-lg border" style={{ borderColor: "rgba(245,235,221,0.12)" }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: "rgba(245,235,221,0.04)" }}>
                <th className="px-3 py-1.5 text-left font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Language</th>
                <th className="px-3 py-1.5 text-right font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {subtitles.map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid rgba(245,235,221,0.08)" }}>
                  <td className="px-3 py-1.5" style={{ color: "rgba(245,235,221,0.85)" }}>{s.language_label}</td>
                  <td className="px-3 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(s.id)}
                      disabled={deletingId === s.id}
                      className="inline-flex items-center gap-1 text-[11px] font-medium disabled:opacity-50"
                      style={{ color: "#f87171" }}
                    >
                      <Trash2 className="h-3 w-3" /> {deletingId === s.id ? "Removing…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center gap-2">
        <select
          value={languageCode}
          onChange={(e) => setLanguageCode(e.target.value)}
          className="rounded-lg border bg-transparent px-2 py-1.5 text-xs"
          style={{ borderColor: "rgba(245,235,221,0.15)", color: "rgba(245,235,221,0.85)" }}
        >
          {COMMON_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code} style={{ background: "#150307" }}>{l.label}</option>
          ))}
        </select>
        <label
          className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:opacity-80"
          style={{ borderColor: "rgba(245,235,221,0.15)", color: "rgba(245,235,221,0.7)" }}
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? "Uploading…" : "Add subtitle (.srt/.vtt)"}
          <input type="file" accept=".srt,.vtt" className="hidden" disabled={uploading} onChange={handleFileSelect} />
        </label>
      </div>
      {error && <p className="mt-1.5 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}
    </div>
  );
}
