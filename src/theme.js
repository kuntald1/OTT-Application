// ---------------------------------------------------------------------------
// Shared "Theater" palette — applied across all three sections (Video
// Streaming, Movies, Theater) so the whole site reads as one brand instead
// of three differently-tinted demos.
//
//   Burgundy  #7B1E2B  — primary (CTAs, active states, accent bars)
//   Gold      #D4AF37  — secondary accent (ratings, highlights, dividers)
//   Black     #111111  — dark surfaces / backgrounds
//   Cream     #F5EBDD  — light text/background, warm off-white
// ---------------------------------------------------------------------------

export const COLORS = {
  burgundy: "#73001E", // "Main burgundy" from the fabric analysis
  burgundyLight: "#C80C3D", // "Bright crimson reflection" — lit-fold highlight
  burgundyMuted: "#5E0018", // "Main deep wine" — used for the nav header
  burgundyDark: "#240007", // "Dark shadow" — deep fold/shadow tone
  shimmer: "#C45C75", // "Silverish fabric reflection" — muted pink-red sheen
  gold: "#D4AF37",
  goldLight: "#E8C171",
  black: "#3D000D", // deep-wine base background, from the gradient's starting stop
  blackSoft: "#4A0016",
  cream: "#F5EBDD",
};

// Multi-stop gradient reproducing the actual curtain photo's transition —
// pitch-dark base fading into deep shadow, then up through mid-tone velvet
// into the lit highlight — rather than a flat two-color blend.
export const CURTAIN_GRADIENT = `linear-gradient(105deg, ${COLORS.black} 0%, ${COLORS.black} 45%, ${COLORS.burgundyDark} 60%, ${COLORS.burgundy} 85%, ${COLORS.burgundyLight} 100%)`;

// Nav header fade — muted red at the top, sinking through shadow into full
// transparency by the bottom edge, so the nav bleeds directly into whatever
// hero content sits beneath it instead of hard-stopping as a flat bar.
export const NAV_GRADIENT = `linear-gradient(180deg, ${COLORS.burgundyMuted}E6 0%, ${COLORS.burgundyDark}99 60%, transparent 100%)`;

// Marquee-curtain gradient — the one recurring "premium/cinema" cue used on
// every primary button across the site. Gold, matching the reference
// palette, with dark text (CTA_TEXT_COLOR) for contrast.
export const CTA_GRADIENT = `linear-gradient(to bottom, ${COLORS.goldLight}, ${COLORS.gold})`;
export const CTA_TEXT_COLOR = "#241014";

// Height for all three Hero sections — shrunk from full-viewport (h-screen)
// so the Browse feed underneath is visibly peeking above the fold.
export const HERO_HEIGHT_CLASS = "h-[78vh] min-h-[560px]";

// Small breathing room at the top of each Browse section — NOT nav
// clearance (Browse sits below Hero in normal document flow, well clear of
// the fixed TopNav already), just a little visual gap so cards don't touch
// the Hero edge.
export const NAV_CLEARANCE_CLASS = "pt-4 sm:pt-6";
