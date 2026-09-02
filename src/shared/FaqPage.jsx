import React, { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { COLORS, NAV_CLEARANCE_CLASS } from "../theme";
import { fetchFaqs } from "../api";

export default function FaqPage({ onBack }) {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    fetchFaqs().then(setFaqs).catch(() => setFaqs([])).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ background: COLORS.black, minHeight: "100vh", fontFamily: "'Geist', -apple-system, sans-serif" }}>
      <div className={`mx-auto max-w-2xl px-6 py-8 sm:px-10 ${NAV_CLEARANCE_CLASS}`}>
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-2 text-sm font-medium hover:opacity-80"
          style={{ color: "rgba(245,235,221,0.6)" }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <h1 className="mb-6 text-3xl font-semibold" style={{ color: COLORS.cream }}>FAQs</h1>

        {loading ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>
        ) : faqs.length === 0 ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No FAQs yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {faqs.map((f) => {
              const isOpen = openId === f.id;
              return (
                <div key={f.id} className="rounded-xl" style={{ background: "rgba(245,235,221,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : f.id)}
                    className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                  >
                    <span className="text-sm font-medium sm:text-base" style={{ color: COLORS.cream }}>{f.question}</span>
                    <ChevronDown className="h-4 w-4 flex-shrink-0 transition-transform" style={{ color: COLORS.gold, transform: isOpen ? "rotate(180deg)" : "none" }} />
                  </button>
                  {isOpen && (
                    <p className="px-5 pb-4 text-sm leading-relaxed" style={{ color: "rgba(245,235,221,0.7)", whiteSpace: "pre-line" }}>
                      {f.answer}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
