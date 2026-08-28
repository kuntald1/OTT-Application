import React from "react";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

// ---------------------------------------------------------------------------
// FilePreview — small inline preview so an upload is visually
// confirmable right where it was uploaded, instead of having to
// scroll elsewhere or guess whether it worked.
//   type="image" -> thumbnail <img>
//   type="video" -> small muted, controls <video>
// ---------------------------------------------------------------------------
export default function FilePreview({ type, src, label }) {
  if (!src) return null;

  return (
    <div className="mt-1.5 flex items-center gap-2">
      {type === "image" ? (
        <img
          src={src}
          alt={label || "preview"}
          className="h-16 w-11 rounded-md object-cover"
          style={{ border: "1px solid rgba(245,235,221,0.15)" }}
        />
      ) : (
        <video
          src={src}
          controls
          muted
          className="h-16 w-28 rounded-md object-cover"
          style={{ border: "1px solid rgba(245,235,221,0.15)", background: "#000" }}
        />
      )}
      {label && <span className="text-[11px]" style={{ color: "rgba(245,235,221,0.5)" }}>{label}</span>}
    </div>
  );
}
