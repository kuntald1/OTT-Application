import React from "react";
import { ArrowLeft, Video, Upload } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";

// ---------------------------------------------------------------------------
// My Video List — Content Creator / Plays Organiser only. A static shell
// for now: theomy doesn't have real video upload/hosting infrastructure
// yet, so this page shows the intended layout with placeholder state
// rather than fake data pretending videos exist. Wiring this up for real
// (upload, storage, encoding, and a video catalog tied to each creator)
// is a separate, larger piece of work.
// ---------------------------------------------------------------------------

export default function MyVideoListPage({ onBack }) {
  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className="mx-auto max-w-3xl px-6 pb-16 pt-24 sm:px-10 sm:pt-28">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
          style={{ color: COLORS.gold }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold" style={{ color: COLORS.cream }}>My Video List</h1>
            <p className="mt-1 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>Videos you've uploaded to theomy.</p>
          </div>
          <button
            type="button"
            disabled
            className="flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold opacity-50"
            style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            title="Video upload isn't available yet"
          >
            <Upload className="h-4 w-4" /> Upload video
          </button>
        </div>

        <div
          className="flex flex-col items-center justify-center gap-3 rounded-2xl px-6 py-16 text-center"
          style={{ background: COLORS.blackSoft, border: "1px dashed rgba(212,175,55,0.25)" }}
        >
          <Video className="h-8 w-8" style={{ color: "rgba(212,175,55,0.5)" }} />
          <p className="text-sm font-medium" style={{ color: "rgba(245,235,221,0.7)" }}>No videos yet</p>
          <p className="max-w-sm text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>
            Video upload isn't live yet. Once it is, everything you upload will appear here — title, thumbnail, view count, and status.
          </p>
        </div>
      </main>
    </div>
  );
}
