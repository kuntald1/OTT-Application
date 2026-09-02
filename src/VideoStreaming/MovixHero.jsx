import { COLORS } from "../theme";
import PageHero from "../shared/PageHero";

// ---------------------------------------------------------------------------
// MOVIX — Video Streaming hero. Content (image/video/text, headline) is now
// admin-managed — see Admin > Page Heroes — instead of scanning
// src/assets/HeroVideo/ at build time. Only this page's color theme
// (burgundy scrim/glow) stays here, since that's Plays' own visual identity.
// ---------------------------------------------------------------------------

const PLAYS_THEME = {
  fallbackBg: COLORS.black,
  scrim: "linear-gradient(180deg, rgba(61,0,13,0.35) 0%, rgba(61,0,13,0.05) 30%, rgba(61,0,13,0.55) 100%)",
  glow: `radial-gradient(ellipse at 15% 100%, ${COLORS.burgundy}55 0%, transparent 45%), radial-gradient(ellipse at 100% 0%, ${COLORS.burgundy}40 0%, transparent 40%)`,
  vignette: `radial-gradient(circle, transparent 40%, ${COLORS.black} 100%)`,
};

export default function MovixHero() {
  return <PageHero pageKey="plays" theme={PLAYS_THEME} />;
}
