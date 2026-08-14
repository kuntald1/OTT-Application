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
// ---------------------------------------------------------------------------

export default function MyListPage({ onNavigate }) {
  const { myList, removeFromList } = useApp();

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
                Browse Video Streaming, Movies, Theater, or Archive and tap the + on any title to add it here.
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
          <>
            <p className="mb-4 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>{myList.length} saved</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {myList.map((item) => (
                <div key={item.id} className="group relative">
                  <div
                    className="relative aspect-video overflow-hidden rounded-xl"
                    style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.06)" }}
                  >
                    <img src={item.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeFromList(item.id)}
                      aria-label="Remove from My List"
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity duration-200 hover:bg-black/90 group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: COLORS.gold }}>
                      {item.section}
                    </span>
                  </div>
                  <p className="mt-2.5 truncate text-sm font-medium" style={{ color: COLORS.cream }}>{item.title}</p>
                  <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{item.meta}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Soft upsell toward the subscription page */}
        <div
          className="mt-8 flex flex-col items-start justify-between gap-4 rounded-2xl px-6 py-6 sm:flex-row sm:items-center"
          style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.2)" }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>Want unlimited access?</p>
            <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.6)" }}>
              See our Play, Archive, and Both plans.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate?.("subscription")}
            className="flex-shrink-0 rounded-full px-5 py-2 text-sm font-medium"
            style={{ border: `1px solid ${COLORS.gold}`, color: COLORS.gold }}
          >
            View Plans
          </button>
        </div>
      </main>
    </div>
  );
}
