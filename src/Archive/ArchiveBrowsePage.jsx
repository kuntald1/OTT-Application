import React, { useEffect, useState } from "react";
import { NAV_CLEARANCE_CLASS } from "../theme";
import { useApp } from "../context/AppContext";
import { useAnimatedModal } from "../shared/useAnimatedModal";
import DiscoveryRows from "../shared/DiscoveryRows";
import { fetchContinueWatching, fetchRecommendedForMe, fetchSpecialCategories } from "../api";
import { GenreRow, RealDetailModal } from "../VideoStreaming/VideoBrowsePage";

// ---------------------------------------------------------------------------
// Archive's own Browse feed — now REAL data (previously fake/demo cards
// with invented titles/years, never wired to the actual catalog). Mirrors
// Play's exact pattern (see VideoStreaming/VideoBrowsePage.jsx): dated
// Special Categories banner first, then Recommended for You, then
// permanent hand-curated "Section Wise Video" rows (replacing what would
// otherwise have been auto-generated genre rows — a client explicitly
// asked for hand-picked/ordered rows instead, same as Play), then
// Continue Watching, then Popular Languages/Studios via DiscoveryRows.
// If nothing has been curated for Archive yet, only Recommended for You /
// Continue Watching / Popular Languages / Studios show — never an
// auto-generated category row.
//
// Real playback/detail modal is the SAME shared component Play and
// Category pages use (RealDetailModal — ads, revenue tracking, resume,
// subtitles all included), not a separate demo modal.
// ---------------------------------------------------------------------------

// Archive-only palette — kept exactly as before: a warm, aged sepia-bronze
// tone (old film stock) instead of the burgundy used elsewhere, since this
// section is framed as archival/vintage footage.
const ARCHIVE_BG = "#4A2A0A";
const ARCHIVE_TEXTURE = `linear-gradient(180deg, ${ARCHIVE_BG} 0%, ${ARCHIVE_BG} 10%, #6B4419 22%, #B8792E 38%, #D4A244 46%, #B8792E 54%, #6B4419 68%, ${ARCHIVE_BG} 82%, ${ARCHIVE_BG} 100%)`;

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const FALLBACK_GRADIENTS = [
  "linear-gradient(135deg, #3a1a1a, #1a0a0a)",
  "linear-gradient(135deg, #1a2a3a, #0a141a)",
  "linear-gradient(135deg, #2a1a3a, #140a1a)",
];

function toCard(v) {
  return {
    id: v.id,
    title: v.title,
    poster: v.poster_image_url || v.thumbnail_url || FALLBACK_GRADIENTS[hashStr(v.id) % FALLBACK_GRADIENTS.length],
    isReal: true,
    videoId: v.id,
    trailerUrl: v.trailer_playback_url || null,
  };
}

export default function ArchiveBrowsePage({ onNavigate, onOpenPerson }) {
  const { isLoggedIn, requestLogin } = useApp();
  const modal = useAnimatedModal();

  // Admin-curated "Special Categories" — dated ones (e.g. a temporary
  // banner) always render first, above everything; permanent ones
  // (no end date — "Section Wise Video" in Admin) sit where an
  // auto-generated category row would have gone. See
  // backend/app/models.py's SpecialCategory docstring.
  const [specialCategories, setSpecialCategories] = useState([]);
  useEffect(() => {
    fetchSpecialCategories("archive")
      .then(setSpecialCategories)
      .catch(() => setSpecialCategories([]));
  }, []);
  const datedSpecials = specialCategories.filter((sc) => sc.visible_from);
  const permanentSpecials = specialCategories.filter((sc) => !sc.visible_from);

  const [recommended, setRecommended] = useState([]);
  useEffect(() => {
    if (!isLoggedIn) {
      setRecommended([]);
      return;
    }
    fetchRecommendedForMe()
      .then((videos) => setRecommended(videos.map(toCard)))
      .catch(() => setRecommended([]));
  }, [isLoggedIn]);

  const [continueWatching, setContinueWatching] = useState([]);
  const loadContinueWatching = () => {
    if (!isLoggedIn) {
      setContinueWatching([]);
      return;
    }
    fetchContinueWatching("archive")
      .then((rows) =>
        setContinueWatching(
          rows.map((v) => ({
            id: v.video_id,
            title: v.title,
            poster: v.poster_image_url || v.thumbnail_url || FALLBACK_GRADIENTS[hashStr(v.video_id) % FALLBACK_GRADIENTS.length],
            isReal: true,
            videoId: v.video_id,
            progressPercent: v.progress_percent,
            trailerUrl: v.trailer_playback_url || null,
          }))
        )
      )
      .catch(() => setContinueWatching([]));
  };
  useEffect(loadContinueWatching, [isLoggedIn]);

  const handleSelectCard = (card) => {
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    modal.open(card);
  };

  return (
    <div
      style={{
        backgroundColor: ARCHIVE_BG,
        backgroundImage: ARCHIVE_TEXTURE,
        backgroundSize: "100% 700px",
        backgroundRepeat: "repeat-y",
        fontFamily: "'Geist', -apple-system, sans-serif",
        minHeight: "100vh",
      }}
    >
      <main className={`px-6 py-8 sm:px-10 ${NAV_CLEARANCE_CLASS}`}>
        {datedSpecials.map((sc) => (
          <GenreRow key={sc.id} category={sc.title} cards={sc.videos.map(toCard)} onSelect={handleSelectCard} />
        ))}
        {recommended.length > 0 && (
          <GenreRow category="Recommended for You" cards={recommended} onSelect={handleSelectCard} />
        )}
        {permanentSpecials.map((sc) => (
          <GenreRow key={sc.id} category={sc.title} cards={sc.videos.map(toCard)} onSelect={handleSelectCard} />
        ))}
        {continueWatching.length > 0 && (
          <GenreRow category="Continue Watching" cards={continueWatching} onSelect={handleSelectCard} />
        )}
      </main>

      <DiscoveryRows section="archive" onNavigate={onNavigate} />

      {modal.item && (
        <RealDetailModal
          card={modal.item}
          closing={modal.closing}
          onClose={modal.close}
          onNavigate={onNavigate}
          onSelectRelated={(relatedCard) => modal.open(relatedCard)}
        />
      )}
    </div>
  );
}
