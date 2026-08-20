import React, { useEffect, useState } from "react";
import { ArrowLeft, IndianRupee, TrendingUp, Wallet } from "lucide-react";
import { COLORS } from "../theme";
import { fetchRevenueRate } from "../api";

// ---------------------------------------------------------------------------
// Revenue — Content Creator / Plays Organiser only. The per-minute rate
// shown here is REAL, read live from the revenue_rate_config database
// table (admin-editable). Views, earnings, withdrawal requests, and
// analytics are placeholder — theomy doesn't have real video watch-time
// tracking yet, so there's no genuine per-creator viewing data to show.
// Once video upload + playback tracking exist, this page's numbers become
// real without needing a redesign — just wiring real data into the same
// layout.
// ---------------------------------------------------------------------------

export default function RevenuePage({ onBack }) {
  const [rate, setRate] = useState(null);

  useEffect(() => {
    fetchRevenueRate().then(setRate).catch(() => setRate(null));
  }, []);

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

        <h1 className="mb-1 text-3xl font-semibold" style={{ color: COLORS.cream }}>Revenue</h1>
        <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
          Views, withdrawal requests & payment tracking. Content performance analytics.
        </p>

        <div className="mb-8 rounded-2xl p-5" style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.25)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Current revenue-share rate</p>
          <p className="mt-1 text-2xl font-semibold" style={{ color: COLORS.gold }}>
            {rate ? rate.rate_display : "Loading…"}
          </p>
          <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
            You earn this rate for every minute a viewer watches your content. Set by theomy, subject to change.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl p-5" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}>
            <TrendingUp className="mb-2 h-5 w-5" style={{ color: "rgba(212,175,55,0.6)" }} />
            <p className="text-2xl font-semibold" style={{ color: COLORS.cream }}>—</p>
            <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Total watch minutes</p>
          </div>
          <div className="rounded-2xl p-5" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}>
            <IndianRupee className="mb-2 h-5 w-5" style={{ color: "rgba(212,175,55,0.6)" }} />
            <p className="text-2xl font-semibold" style={{ color: COLORS.cream }}>—</p>
            <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Total earned</p>
          </div>
          <div className="rounded-2xl p-5" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}>
            <Wallet className="mb-2 h-5 w-5" style={{ color: "rgba(212,175,55,0.6)" }} />
            <p className="text-2xl font-semibold" style={{ color: COLORS.cream }}>—</p>
            <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Available to withdraw</p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl p-6 text-center" style={{ background: COLORS.blackSoft, border: "1px dashed rgba(212,175,55,0.25)" }}>
          <p className="text-sm font-medium" style={{ color: "rgba(245,235,221,0.7)" }}>No earnings data yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>
            Once video upload and watch-time tracking are live, your view counts, earnings, withdrawal history, and per-video performance will appear here automatically.
          </p>
        </div>
      </main>
    </div>
  );
}
