import { useEffect, useState } from "react";
import { COLORS } from "../theme";

// ---------------------------------------------------------------------------
// CurtainReveal — a generic "curtains slowly part" overlay that sits on top
// of a hero video/image. The video underneath starts playing immediately
// (as it always did); this overlay just covers it for a moment, then slides
// both halves off-screen to reveal whatever's already playing beneath.
//
// Because this is pure CSS/DOM animation with no video content of its own,
// dropping a NEW file into src/assets/HeroVideo/ automatically gets the
// same curtain-opening effect — the curtain and the footage are no longer
// baked together into one file.
//
// Usage: <CurtainReveal /> — drop it as the last element inside a
// `position: relative` hero container, above the video/scrim layers.
// ---------------------------------------------------------------------------

export default function CurtainReveal({ delay = 500, duration = 1800 }) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const openTimer = setTimeout(() => setOpen(true), delay);
    const hideTimer = setTimeout(() => setHidden(true), delay + duration + 150);
    return () => {
      clearTimeout(openTimer);
      clearTimeout(hideTimer);
    };
  }, [delay, duration]);

  if (hidden) return null;

  // Vertical fold texture layered under the solid velvet gradient — same
  // visual language as the curtain photos used elsewhere on the site.
  const foldTexture = "repeating-linear-gradient(90deg, rgba(0,0,0,0.18) 0px, transparent 10px, rgba(255,255,255,0.05) 20px, transparent 32px)";
  const panelBase = `linear-gradient(180deg, ${COLORS.burgundyLight} 0%, ${COLORS.burgundy} 45%, ${COLORS.burgundyDark} 100%)`;
  const transition = `transform ${duration}ms cubic-bezier(0.65, 0, 0.35, 1)`;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 w-1/2"
        style={{
          background: `${foldTexture}, ${panelBase}`,
          boxShadow: "inset -24px 0 48px rgba(0,0,0,0.5)",
          transform: open ? "translateX(-100%)" : "translateX(0)",
          transition,
        }}
      />
      <div
        className="absolute inset-y-0 right-0 w-1/2"
        style={{
          background: `${foldTexture}, ${panelBase}`,
          boxShadow: "inset 24px 0 48px rgba(0,0,0,0.5)",
          transform: open ? "translateX(100%)" : "translateX(0)",
          transition,
        }}
      />
    </div>
  );
}
