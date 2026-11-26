import React from "react";
import { Bookmark, ArrowRight, X } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { useApp } from "../context/AppContext";

// ---------------------------------------------------------------------------
// My List — reached from the nav once logged in.
//
// Reads real saved items from AppContext (populated by the "+" button in
// every section's detail modal — Video Streaming, Movies, Theater, Archive).
// Each item has a remove (X) button that pulls it straight back out.
//
// The two kinds of saved thing are kept in SEPARATE rows rather than mixed
// into one grid, because they are not alternatives: one is a recording you
// watch now, the other a show you travel to on a date. A row only appears
// when something is in it.
// ---------------------------------------------------------------------------

// Everything that isn't a ticketed show is something to watch, whichever
// browse page it was saved from ("Video Streaming" on Contemporary,
// "Movies" on Heritage). Two rows, never a third.
const ROWS = [
  {
    key: "watch",
    label: "Video Streaming",
    blurb: "Recordings you can watch now.",
    holds: (item) => item.section !== "Theater",
  },
  {
    key: "theater",
    label: "Theater",
    blurb: "Live shows to book a seat for.",
    holds: (item) => item.section === "Theater",
  },
];

export default function MyListPage({ onNavigate }) {
  const { myList, removeFromList } = useApp();

  // Where a card goes when tapped. Theater items are event enquiries, so
  // their id is the eventDetail id; a saved video reopens on the browse
  // page it belongs to, with its detail modal already up — the same route
  // search results use, so there is one way into a video, not two.
  const openItem = (item) => {
    if (item.section === "Theater") {
      onNavigate?.("eventDetail", { eventId: item.id });
      return;
    }
    onNavigate?.(item.section === "Movies" ? "accordion" : "hero", { openVideoId: item.id });
  };

  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className="px-6 pb-12 pt-24 sm:px-10 sm:pt-28">
        <h1 className="mb-2 text-3xl font-semibold" style={{ color: COLORS.cream }}>My List</h1>
        <p className="mb-10 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
          Shows and plays you've saved to watch or book later.
        </p>

        {myList.length === 0 ? (
          <div
            className="flex flex-col items-center gap-4 rounded-2xl px-6 py-16 text-center"
            style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.15)" }}
          >
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: "rgba(212,175,55,0.12)" }}
            >
              <Bookmark className="h-6 w-6" style={{ color: COLORS.gold }} />
            </div>
            <div>
              <p className="text-lg font-semibold" style={{ color: COLORS.cream }}>Nothing saved yet</p>
              <p className="mt-1 max-w-sm text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
                Browse Video Streaming, Movies, Theater, or Heritage and tap the + on any title to add it here.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate?.("hero")}
              className="mt-2 flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            >
              Start browsing <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          ROWS.map(({ key, label, blurb, holds }) => {
            const items = myList.filter(holds);
            if (items.length === 0) return null;
            return (
              <section key={key} className="mb-12 last:mb-0">
                <div className="mb-4 flex items-baseline gap-3">
                  <h2 className="text-lg font-semibold" style={{ color: COLORS.cream }}>{label}</h2>
                  <span className="text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>
                    {items.length} saved · {blurb}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {items.map((item) => (
                    <div key={item.id} className="group relative">
                      {/* The whole poster is the way in. The remove X sits
                          on top of it and stops the click from reaching
                          here, so tidying up never opens something. */}
                      <button
                        type="button"
                        onClick={() => openItem(item)}
                        className="relative block aspect-video w-full overflow-hidden rounded-xl text-left transition-transform duration-200 hover:scale-[1.03]"
                        style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.06)" }}
                      >
                        <img src={item.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeFromList(item.id); }}
                        aria-label={`Remove ${item.title} from My List`}
                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity duration-200 hover:bg-black/90 group-hover:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openItem(item)}
                        className="mt-2.5 block w-full text-left"
                      >
                        <p className="truncate text-sm font-medium" style={{ color: COLORS.cream }}>{item.title}</p>
                        <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{item.meta}</p>
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })
        )}
      </main>
    </div>
  );
}
