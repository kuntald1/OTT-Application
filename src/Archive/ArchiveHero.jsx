import PageHero from "../shared/PageHero";

// ---------------------------------------------------------------------------
// Archive hero. Content (image/video/text, headline) is now admin-managed —
// see Admin > Page Heroes — instead of scanning src/Archive/assets/
// ArchiveVideo/ at build time. Only this page's color theme (sepia-bronze
// scrim/glow) stays here, since that's Archive's own visual identity —
// deliberately not the shared burgundy background Plays/Community use.
// ---------------------------------------------------------------------------

const ARCHIVE_BG = "#4A2A0A";

const ARCHIVE_THEME = {
  fallbackBg: ARCHIVE_BG,
  scrim: "linear-gradient(180deg, rgba(74,42,10,0.45) 0%, rgba(74,42,10,0.15) 30%, rgba(74,42,10,0.7) 100%)",
  glow: "radial-gradient(ellipse at 15% 100%, #B8792E70 0%, transparent 50%), radial-gradient(ellipse at 100% 0%, #D4A24460 0%, transparent 45%)",
  vignette: `radial-gradient(circle, transparent 40%, ${ARCHIVE_BG} 100%)`,
};

export default function ArchiveHero() {
  return <PageHero pageKey="archive" theme={ARCHIVE_THEME} />;
}
