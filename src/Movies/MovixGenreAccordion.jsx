import React, { useEffect, useState } from "react";
import { Play, Info, Sunset, CalendarDays, Users, Moon, X, Star } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR, HERO_HEIGHT_CLASS } from "../theme";
import { fetchArchiveHeroSlides } from "../api";
import tonightPoster from "../assets/posters/originals.jpg";
import bingePoster from "../assets/posters/series.jpg";
import familyPoster from "../assets/posters/family.jpg";
import lateNightPoster from "../assets/posters/films.jpg";

// ---------------------------------------------------------------------------
// MOVIX — genre accordion hero (mood/occasion-based)
//
// Adapts the "horizontal accordion" interaction from the reference portfolio
// template into an OTT browsing hero, organized by occasion/mood rather
// than content type — Watch Tonight / Weekend Binge / Family Time / Late
// Night — since this maps well to how people actually decide what to watch
// ("what am I in the mood for") rather than making them pick a content
// category first. Content-type filtering (films vs. series) can still live
// one level deeper, inside each mood's results.
//
// Design decisions carried over from the earlier Movix hero for brand
// consistency: navy/near-black base, teal secondary, velvet-crimson CTA
// gradient, the aperture-mark logo.
//
// Click behavior: onSelectGenre(genre) fires when a panel is clicked —
// wire this to your router/navigation. Left as a callback rather than
// hardcoded navigation since this is a component, not a full app.
//
// Image/label/title/blurb for these 4 panels are admin-editable — see
// Admin > Archive Hero Slides (the same GET /archive-hero-slides used
// elsewhere), matched onto these 4 fixed slots BY POSITION (slide 0 ->
// watch-tonight, slide 1 -> weekend-binge, etc.). The slot's id/icon/
// tint/accent/number stay hardcoded here since they're wired to deeper
// functionality (MOOD_CONTENT below, keyed by these exact 4 ids, powers
// the Browse/Details overlay) — only content, not structure, is dynamic.
// A slot falls back to its original built-in image/text if fewer than
// 4 admin slides exist yet, so nothing ever renders broken/empty.
// ---------------------------------------------------------------------------

const NAVY_DEEP = COLORS.black;
const TEAL = COLORS.gold;

// Bronze/amber background — matches the palette applied to the Browse feed
// below, so hero and browse read as one continuous surface. NAVY_DEEP is
// kept as-is for icon-contrast purposes (dark icon on a gold circle),
// unrelated to the page background.
const ARCHIVE_BG = "#4A2A0A";

const BASE_GENRES = [
  {
    id: "watch-tonight",
    number: "01",
    label: "Watch Tonight",
    icon: Sunset,
    title: "Watch tonight",
    blurb: "Handpicked for right now — no endless scrolling, just press play.",
    tint: "#3A230E",
    accent: "#D4972B",
    poster: tonightPoster,
  },
  {
    id: "weekend-binge",
    number: "02",
    label: "Weekend Binge",
    icon: CalendarDays,
    title: "Weekend binge",
    blurb: "Full seasons queued up — clear your Saturday, we've got the rest.",
    tint: "#0E2A3A",
    accent: "#1D7FA6",
    poster: bingePoster,
  },
  {
    id: "family-time",
    number: "03",
    label: "Family Time",
    icon: Users,
    title: "Family time",
    blurb: "Something everyone in the room can agree on, for once.",
    tint: "#3A2210",
    accent: "#E08A4A",
    poster: familyPoster,
  },
  {
    id: "late-night",
    number: "04",
    label: "Late Night",
    icon: Moon,
    title: "Late night",
    blurb: "Quiet, moody, one-more-episode watching for when everyone's asleep.",
    tint: "#150A18",
    accent: "#C4432B",
    poster: lateNightPoster,
  },
];

// Merges admin-uploaded slides (by position) onto the 4 fixed base slots —
// a slide only overrides poster/label/title/blurb, never id/icon/tint/
// accent/number.
function buildGenres(slides) {
  return BASE_GENRES.map((base, i) => {
    const slide = slides[i];
    if (!slide) return base;
    return {
      ...base,
      poster: slide.image_url,
      label: slide.eyebrow || base.label,
      title: slide.headline || base.title,
      blurb: slide.subtext || base.blurb,
    };
  });
}

// Placeholder catalog content per mood, purely for demo purposes — original
// fictional titles, synopses, cast/crew names, and reviews (no real film/
// show names, studio branding, or real people), since a real catalog isn't
// wired up yet. Cast/crew render as initials avatars, never photos — using
// real actor photos here would misrepresent real people in a fictional
// context, on top of the licensing issue. Swap this whole object for real
// API data later; the overlay components just render whatever's in here.
const MOOD_CONTENT = {
  "watch-tonight": {
    featured: {
      title: "Amber Horizon",
      rating: "8.7", votes: "42K+", duration: "2h 10m",
      genres: "Drama, Mystery", cert: "UA13+", year: "2026",
      languages: "English, Hindi, +3",
      synopsis:
        "A cartographer discovers her late father's final survey points to a town that isn't on any map. What she finds there rewrites everything she thought she knew about why he really disappeared for six months, twenty years ago.",
      cast: [
        { name: "Reva Anand", role: "Mira Kapoor" },
        { name: "Devon Okafor", role: "Elian Voss" },
        { name: "Priya Sundaram", role: "Detective Rao" },
        { name: "Marcus Lindqvist", role: "Old Whitfield" },
        { name: "Yuki Tanaka", role: "Sana" },
      ],
      crew: [
        { name: "Lena Whitfield", role: "Director" },
        { name: "Omar Reyes", role: "Writer" },
        { name: "Fatima Chowdhury", role: "Producer" },
        { name: "Theo Bergman", role: "Cinematographer" },
      ],
      reviews: [
        { name: "Ashwin K.", rating: "9", tags: ["#SlowBurn", "#GreatEnding"], text: "Didn't expect to be this invested by the halfway mark. The last twenty minutes recontextualize the whole film." },
        { name: "Meera P.", rating: "8", tags: ["#Atmospheric"], text: "Gorgeous cinematography, patient pacing. Not for everyone but rewarding if you stick with it." },
      ],
    },
    grid: [
      "Amber Horizon", "Midnight Ledger", "The Long Return", "Salt & Static",
      "Quiet Harbor", "Nine Red Doors", "Paper Tigers", "Low Tide",
    ],
  },
  "weekend-binge": {
    featured: {
      title: "The Ledger House",
      rating: "9.1", votes: "88K+", duration: "8 episodes",
      genres: "Thriller, Drama", cert: "UA16+", year: "2026",
      languages: "English, Hindi, +2",
      synopsis:
        "When a small-town accountant finds a decades-old discrepancy in the family firm's books, she pulls a thread that unravels three generations of a town built on one very well-kept secret.",
      cast: [
        { name: "Naomi Prescott", role: "Cara Voss" },
        { name: "Kabir Malhotra", role: "Sgt. Iyer" },
        { name: "Elias Vaughn", role: "Grandfather Reed" },
        { name: "Sofia Marchetti", role: "Nell" },
        { name: "Daniel Osei", role: "Marcus Reed" },
      ],
      crew: [
        { name: "Priyanka Deshmukh", role: "Showrunner" },
        { name: "Connor Blake", role: "Director (Ep 1-4)" },
        { name: "Hana Suzuki", role: "Writer" },
      ],
      reviews: [
        { name: "Ritwik S.", rating: "10", tags: ["#Bingeable", "#GreatEnsemble"], text: "Watched all 8 in a weekend, no regrets. Every episode ends on a gut-punch." },
        { name: "Claire O.", rating: "9", tags: ["#Twisty"], text: "The mid-season twist genuinely got me. Great ensemble cast, nobody feels wasted." },
      ],
    },
    grid: [
      "The Ledger House", "Faultlines", "Nightshift", "Glass Ceiling",
      "Cul-de-Sac", "The Understudy", "Rebound", "Outer Ring",
    ],
  },
  "family-time": {
    featured: {
      title: "The Kite Runners' Club",
      rating: "8.3", votes: "21K+", duration: "1h 42m",
      genres: "Family, Adventure", cert: "U", year: "2025",
      languages: "English, Hindi, +4",
      synopsis:
        "Three cousins spending one last summer together before the family moves cities decide to build the kite their grandfather never finished — and accidentally start the whole neighborhood's biggest kite festival in a decade.",
      cast: [
        { name: "Aarav Bhatt", role: "Kunal" },
        { name: "Zoe Whitman", role: "Priya" },
        { name: "Leo Fontaine", role: "Sam" },
        { name: "Nadia Osman", role: "Grandmother Asha" },
      ],
      crew: [
        { name: "Wren Castillo", role: "Director" },
        { name: "Aditi Kher", role: "Writer" },
        { name: "Sam Okonkwo", role: "Producer" },
      ],
      reviews: [
        { name: "Family of 4", rating: "9", tags: ["#KidsLovedIt", "#Wholesome"], text: "Finally a family film that isn't grating for the adults either. Genuinely sweet." },
        { name: "Tanya R.", rating: "8", tags: ["#Rewatchable"], text: "My 8-year-old has asked to rewatch it three times already." },
      ],
    },
    grid: [
      "The Kite Runners' Club", "Backyard Explorers", "Grandpa's Attic", "Sunday Circus",
      "The Recipe Box", "Puddle Jumpers", "Mapleview", "Six Cousins",
    ],
  },
  "late-night": {
    featured: {
      title: "Static Hours",
      rating: "8.9", votes: "31K+", duration: "1h 58m",
      genres: "Noir, Thriller", cert: "UA16+", year: "2026",
      languages: "English",
      synopsis:
        "A late-shift radio host starts receiving calls from a number that was disconnected six years ago — from a voice that knows things about tonight that haven't happened yet.",
      cast: [
        { name: "Julian Cross", role: "Mara Voss" },
        { name: "Isabela Ferro", role: "The Caller" },
        { name: "Grant Ashby", role: "Detective Wren" },
      ],
      crew: [
        { name: "Noor Siddiqui", role: "Director" },
        { name: "Marcus Vale", role: "Writer" },
        { name: "Elena Popescu", role: "Composer" },
      ],
      reviews: [
        { name: "DarkRoomFilms", rating: "9", tags: ["#Unsettling", "#GreatScore"], text: "The sound design alone makes this worth a late-night watch with headphones on." },
        { name: "Priya M.", rating: "9", tags: ["#OnePlaceOneNight"], text: "Barely leaves the radio booth for two hours and never once feels stagey. Tense from minute one." },
      ],
    },
    grid: [
      "Static Hours", "Neon Rain", "The Insomniac", "Last Call",
      "Hollow City", "After Curfew", "Empty Platform", "Glass & Smoke",
    ],
  },
};

// Only one title per mood ("featured") has full editorial data (synopsis,
// cast, crew, reviews) in this demo catalog. The other 7 grid titles get
// lighter, deterministically-generated info instead — enough for Browse to
// lead somewhere real when clicked, without fabricating fake cast/crew/
// reviews for titles that don't have any. DetailsOverlay hides the About/
// Cast/Crew/Reviews sections when those fields are absent.
function hashTitle(title) {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  return h;
}

function getItemForTitle(genre, title) {
  const content = MOOD_CONTENT[genre.id];
  if (title === content.featured.title) return content.featured;
  const h = hashTitle(title);
  const ratings = ["7.6", "7.8", "8.0", "8.2", "8.4", "8.6"];
  const durations = ["1h 46m", "1h 52m", "2h 04m", "6 episodes", "8 episodes", "10 episodes"];
  const years = ["2024", "2025", "2026"];
  return {
    title,
    rating: ratings[h % ratings.length],
    votes: `${(h % 45) + 4}K+`,
    duration: durations[h % durations.length],
    genres: content.featured.genres,
    cert: content.featured.cert,
    year: years[h % years.length],
    languages: content.featured.languages,
  };
}

// Abstract, non-representational poster art per genre — geometric motifs
// echoing each icon rather than stock photography, so there's no
// copyright/likeness risk and the look stays consistent with the flat
// brand system. Rendered full-bleed behind each panel's content.
function GenreArt({ genreId, accent }) {
  const common = { position: "absolute", inset: 0, width: "100%", height: "100%" };
  switch (genreId) {
    case "watch-tonight":
      // scattered sparkle stars — evening/tonight
      return (
        <svg {...common} viewBox="0 0 200 400" preserveAspectRatio="xMidYMid slice">
          {[
            [40, 60, 10], [150, 40, 14], [70, 150, 8], [160, 200, 12],
            [30, 260, 9], [120, 300, 13], [60, 350, 7], [170, 340, 10],
          ].map(([cx, cy, s], i) => (
            <path
              key={i}
              d={`M${cx} ${cy - s} L${cx + s * 0.28} ${cy - s * 0.28} L${cx + s} ${cy} L${cx + s * 0.28} ${cy + s * 0.28} L${cx} ${cy + s} L${cx - s * 0.28} ${cy + s * 0.28} L${cx - s} ${cy} L${cx - s * 0.28} ${cy - s * 0.28} Z`}
              fill={accent}
              opacity="0.25"
            />
          ))}
        </svg>
      );
    case "weekend-binge":
      // stacked screen rectangles, like queued-up episode tiles
      return (
        <svg {...common} viewBox="0 0 200 400" preserveAspectRatio="xMidYMid slice">
          {Array.from({ length: 6 }).map((_, i) => (
            <rect key={i} x="30" y={30 + i * 62} width="140" height="42" rx="6" fill={accent} opacity="0.15" />
          ))}
        </svg>
      );
    case "family-time":
      // concentric rings — togetherness, warmth radiating outward
      return (
        <svg {...common} viewBox="0 0 200 400" preserveAspectRatio="xMidYMid slice">
          {[30, 60, 90, 120, 150].map((r, i) => (
            <circle key={i} cx="100" cy="150" r={r} fill="none" stroke={accent} strokeWidth="3" opacity={0.22 - i * 0.03} />
          ))}
        </svg>
      );
    case "late-night":
      // diagonal streaks — quiet, moody linework
      return (
        <svg {...common} viewBox="0 0 200 400" preserveAspectRatio="xMidYMid slice">
          {Array.from({ length: 14 }).map((_, i) => (
            <rect key={i} x="20" y={i * 30 - 20} width="26" height="16" rx="3" fill={accent} opacity="0.18" transform={`rotate(18 100 200)`} />
          ))}
          {Array.from({ length: 14 }).map((_, i) => (
            <rect key={`b${i}`} x="154" y={i * 30 - 20} width="26" height="16" rx="3" fill={accent} opacity="0.18" transform={`rotate(18 100 200)`} />
          ))}
        </svg>
      );
    default:
      return null;
  }
}

export default function MovixGenreAccordion({ onSelectGenre = () => {} }) {
  const [slides, setSlides] = useState([]);
  useEffect(() => {
    fetchArchiveHeroSlides().then(setSlides).catch(() => setSlides([]));
  }, []);
  const genres = buildGenres(slides);

  const [hovered, setHovered] = useState(null);
  // { type: 'browse' | 'details', genreId } | null
  const [overlay, setOverlay] = useState(null);
  const activeGenre = overlay ? genres.find((g) => g.id === overlay.genreId) : null;

  return (
    <section
      className={`relative w-full overflow-hidden ${HERO_HEIGHT_CLASS}`}
      style={{ background: ARCHIVE_BG, fontFamily: "'Geist', -apple-system, sans-serif" }}
    >
      {/* The accordion itself */}
      <div className="flex h-full w-full">
        {genres.map((genre) => {
          const Icon = genre.icon;
          const isHovered = hovered === genre.id;
          const isAnyHovered = hovered !== null;
          return (
            <div
              key={genre.id}
              role="button"
              tabIndex={0}
              onMouseEnter={() => setHovered(genre.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(genre.id)}
              onBlur={() => setHovered(null)}
              onClick={() => onSelectGenre(genre.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelectGenre(genre.id);
              }}
              className="group relative flex h-full cursor-pointer flex-col justify-between overflow-hidden border-r border-white/5 px-5 pb-8 pt-20 text-left outline-none last:border-r-0 sm:px-6 sm:pt-24"
              style={{
                flex: isHovered ? 5 : isAnyHovered ? 0.6 : 1,
                transition: "flex 700ms cubic-bezier(.65,0,.35,1)",
                background: ARCHIVE_BG,
              }}
            >
              {/* poster placeholder image — swap the `poster` URL per genre for
                  real artwork once you have it; placehold.co is used here the
                  same way the reference site uses it for un-shot content */}
              <img
                src={genre.poster}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-cover object-top"
                style={{ transform: isHovered ? "scale(1.04)" : "scale(1)", transition: "transform 700ms cubic-bezier(.65,0,.35,1)" }}
              />
              {/* abstract texture layer, on top of the poster for depth */}
              <GenreArt genreId={genre.id} accent={genre.accent} />
              {/* readability gradient over the art */}
              <div
                className="absolute inset-0"
                style={{ background: `linear-gradient(180deg, ${genre.tint}22 0%, transparent 42%, ${ARCHIVE_BG}55 75%, ${ARCHIVE_BG}B0 100%)` }}
              />

              <span className="relative z-10 text-xs text-white/30">{genre.number}</span>

              {/* rotated label — visible when this panel is compact */}
              <span
                className="relative z-10 self-center text-sm tracking-wide text-white/50 transition-opacity duration-300"
                style={{
                  writingMode: "vertical-rl",
                  opacity: isHovered ? 0 : 1,
                  position: isHovered ? "absolute" : "static",
                }}
              >
                {genre.label}
              </span>

              {/* expanded content — visible when this panel is hovered */}
              <div
                className="relative z-10 flex flex-col gap-3 transition-opacity duration-300"
                style={{ opacity: isHovered ? 1 : 0 }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: TEAL }}>
                  <Icon className="h-5 w-5" style={{ color: NAVY_DEEP }} />
                </div>
                <h3 className="text-2xl font-semibold text-white sm:text-3xl">{genre.title}</h3>
                <p className="max-w-xs text-sm leading-relaxed text-white/70">{genre.blurb}</p>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOverlay({ type: "browse", genreId: genre.id });
                    }}
                    className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                    style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
                  >
                    <Play className="h-4 w-4" /> Browse
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOverlay({ type: "details", genreId: genre.id, title: MOOD_CONTENT[genre.id].featured.title });
                    }}
                    className="flex items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/10"
                  >
                    <Info className="h-4 w-4" /> Details
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {overlay && activeGenre && overlay.type === "browse" && (
        <BrowseOverlay
          genre={activeGenre}
          onClose={() => setOverlay(null)}
          onSelectTitle={(title) => setOverlay({ type: "details", genreId: activeGenre.id, title })}
        />
      )}
      {overlay && activeGenre && overlay.type === "details" && (
        <DetailsOverlay genre={activeGenre} title={overlay.title} onClose={() => setOverlay(null)} />
      )}
    </section>
  );
}

// Full-screen slide-up grid — Browse. Reuses each mood's own poster/tint as
// card background since there's no per-title art in this demo catalog; swap
// for real per-title thumbnails once a catalog exists.
function BrowseOverlay({ genre, onClose, onSelectTitle }) {
  const content = MOOD_CONTENT[genre.id];
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: ARCHIVE_BG, animation: "movixSlideUp 420ms cubic-bezier(0.16,1,0.3,1)" }}
    >
      <style>{`@keyframes movixSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      <div className="mx-auto max-w-6xl px-6 py-8 sm:px-10">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <p className="text-xs font-medium tracking-wide" style={{ color: genre.accent }}>
              {genre.number} · {genre.label.toUpperCase()}
            </p>
            <h2 className="mt-2 text-4xl font-bold text-white sm:text-5xl">{genre.title}</h2>
            <p className="mt-3 max-w-xl text-base text-white/60">{genre.blurb}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="fixed right-6 top-6 z-10 flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium tracking-wide text-white/80 backdrop-blur-sm hover:text-white sm:right-10 sm:top-8"
          >
            CLOSE <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {content.grid.map((title) => (
            <button
              type="button"
              key={title}
              onClick={() => onSelectTitle(title)}
              className="group relative aspect-[2/3] overflow-hidden rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <img src={genre.poster} alt="" className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 40%, ${ARCHIVE_BG}EE 100%)` }} />
              <span className="absolute bottom-3 left-3 right-3 text-sm font-medium text-white">{title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Full-screen slide-up single-item page — Details. Layout mirrors a typical
// ticketing-site movie page, but the primary action is "Play" (streaming),
// not "Book tickets" (this isn't a booking flow).
// Initials-based avatar — deliberately not a photo. Using a real photo of a
// real actor for a fictional demo credit would misrepresent them, on top of
// the licensing issue with using photography we don't have rights to.
function Avatar({ name, accent, size = 56 }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className="flex flex-shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.34, background: `${accent}33`, border: `1px solid ${accent}66` }}
    >
      {initials}
    </div>
  );
}

function SectionHeading({ children }) {
  return <h3 className="mb-4 text-xl font-semibold text-white">{children}</h3>;
}

function DetailsOverlay({ genre, title, onClose }) {
  const item = getItemForTitle(genre, title);
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: ARCHIVE_BG, animation: "movixSlideUp 420ms cubic-bezier(0.16,1,0.3,1)" }}
    >
      <style>{`@keyframes movixSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>

      {/* Bigger hero block — full-bleed backdrop image with a gradient, not
          just a small poster thumbnail floating in empty space */}
      <div className="relative h-[65vh] min-h-[460px] w-full overflow-hidden sm:h-[78vh]">
        <img src={genre.poster} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${ARCHIVE_BG}33 0%, ${ARCHIVE_BG}CC 70%, ${ARCHIVE_BG} 100%)` }} />

        <button
          type="button"
          onClick={onClose}
          className="fixed right-6 top-6 z-10 flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium tracking-wide text-white/80 backdrop-blur-sm hover:text-white sm:right-10 sm:top-8"
        >
          CLOSE <X className="h-4 w-4" />
        </button>

        <div className="absolute bottom-0 left-0 right-0 px-6 pb-8 sm:px-10 sm:pb-12">
          <p className="text-sm font-medium tracking-wide" style={{ color: genre.accent }}>
            {genre.label.toUpperCase()} PICK
          </p>
          <h2 className="mt-3 text-4xl font-bold text-white sm:text-6xl">{item.title}</h2>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 rounded-lg border border-white/20 bg-black/30 px-4 py-2.5">
              <Star className="h-5 w-5" style={{ color: genre.accent, fill: genre.accent }} />
              <span className="text-base font-semibold text-white">{item.rating}/10</span>
              <span className="text-sm text-white/50">({item.votes})</span>
            </div>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full px-7 py-3 text-base font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            >
              <Play className="h-5 w-5" style={{ fill: CTA_TEXT_COLOR }} /> Play
            </button>
          </div>

          <p className="mt-5 text-base text-white/70">
            {item.duration} · {item.genres} · {item.cert} · {item.year}
          </p>
          <p className="mt-1 text-sm text-white/50">{item.languages}</p>
        </div>
      </div>

      {/* Scrollable content below the hero */}
      <div className="mx-auto max-w-4xl px-6 py-12 sm:px-10">
        {item.synopsis && (
          <section className="mb-12">
            <SectionHeading>About</SectionHeading>
            <p className="text-base leading-relaxed text-white/75">{item.synopsis}</p>
          </section>
        )}

        <section className="mb-12">
          <SectionHeading>Offers for you</SectionHeading>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-medium text-white">Bundle with the Family plan, save 20%</p>
              <p className="mt-1 text-xs text-white/50">Applies at checkout on annual plans</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-medium text-white">Refer a friend, both get 1 month free</p>
              <p className="mt-1 text-xs text-white/50">No limit on referrals this month</p>
            </div>
          </div>
        </section>

        {item.cast && (
          <section className="mb-12">
            <SectionHeading>Cast</SectionHeading>
            <div className="flex gap-5 overflow-x-auto pb-2">
              {item.cast.map((person) => (
                <div key={person.name} className="flex w-24 flex-shrink-0 flex-col items-center text-center">
                  <Avatar name={person.name} accent={genre.accent} />
                  <p className="mt-2 text-xs font-medium text-white">{person.name}</p>
                  <p className="text-[11px] text-white/50">{person.role}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {item.crew && (
          <section className="mb-12">
            <SectionHeading>Crew</SectionHeading>
            <div className="flex gap-5 overflow-x-auto pb-2">
              {item.crew.map((person) => (
                <div key={person.name} className="flex w-24 flex-shrink-0 flex-col items-center text-center">
                  <Avatar name={person.name} accent={genre.accent} />
                  <p className="mt-2 text-xs font-medium text-white">{person.name}</p>
                  <p className="text-[11px] text-white/50">{person.role}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {item.reviews && (
          <section className="mb-12">
            <SectionHeading>Top reviews</SectionHeading>
            <div className="grid gap-4 sm:grid-cols-2">
              {item.reviews.map((review) => (
                <div key={review.name} className="rounded-lg border border-white/10 bg-white/5 p-5">
                  <div className="mb-2 flex items-center gap-2">
                    <Avatar name={review.name} accent={genre.accent} size={32} />
                    <div>
                      <p className="text-sm font-medium text-white">{review.name}</p>
                      <div className="flex items-center gap-1">
                        <Star className="h-3 w-3" style={{ color: genre.accent, fill: genre.accent }} />
                        <span className="text-xs text-white/60">{review.rating}/10</span>
                      </div>
                    </div>
                  </div>
                  <p className="mb-3 text-sm leading-relaxed text-white/70">{review.text}</p>
                  <div className="flex flex-wrap gap-2">
                    {review.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white/60">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}


