import React, { useState } from "react";
import { ArrowLeft, HandCoins, CheckCircle2 } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { ORGANISERS } from "./organisersData";
import { useApp } from "../context/AppContext";

export default function DonationPage({ onBack }) {
  const { isLoggedIn, requestLogin, addDonation } = useApp();
  const [selected, setSelected] = useState(null);
  const [amount, setAmount] = useState("500");
  const [confirmed, setConfirmed] = useState(null);

  const handleSelect = (organiser) => {
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    setSelected(organiser);
    setConfirmed(null);
  };

  const handleDonate = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    addDonation(selected.id, selected.name, amt);
    setConfirmed(amt);
    setSelected(null);
  };

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

        <h1 className="mb-1 text-3xl font-semibold" style={{ color: COLORS.cream }}>Support a Plays Organiser</h1>
        <p className="mb-8 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
          Donate directly to organisers running independent theatre programs and community initiatives.
        </p>

        {confirmed && (
          <div className="mb-6 flex items-center gap-2 rounded-xl p-4" style={{ background: "rgba(111,207,151,0.1)", border: "1px solid rgba(111,207,151,0.35)" }}>
            <CheckCircle2 className="h-5 w-5" style={{ color: "#6FCF97" }} />
            <p className="text-sm" style={{ color: "#6FCF97" }}>Thanks — your ₹{confirmed} donation was recorded.</p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {ORGANISERS.map((org) => (
            <div key={org.id} className="flex items-start gap-4 rounded-2xl p-5" style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.15)" }}>
              <img src={org.photo} alt="" className="h-14 w-14 flex-shrink-0 rounded-full object-cover object-top" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>{org.name}</p>
                <p className="text-xs" style={{ color: COLORS.gold }}>{org.org}</p>
                <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "rgba(245,235,221,0.6)" }}>{org.bio}</p>
                <button
                  type="button"
                  onClick={() => handleSelect(org)}
                  className="mt-3 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold"
                  style={{ border: `1px solid ${COLORS.gold}`, color: COLORS.gold }}
                >
                  <HandCoins className="h-3.5 w-3.5" /> Donate
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>
          Demo directory — no real payments are processed and these are not real organisations.
        </p>
      </main>

      {selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={() => setSelected(null)}>
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: COLORS.blackSoft, border: `1px solid rgba(212,175,55,0.2)` }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-lg font-semibold" style={{ color: COLORS.cream }}>Donate to {selected.name}</h2>
            <p className="mb-4 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{selected.org}</p>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Amount (₹)</label>
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border px-4 py-2.5 text-sm outline-none"
              style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
            />
            <div className="mt-4 flex items-center justify-between">
              <button onClick={() => setSelected(null)} className="text-xs hover:opacity-80" style={{ color: "rgba(245,235,221,0.5)" }}>Cancel</button>
              <button
                onClick={handleDonate}
                disabled={!Number(amount) || Number(amount) <= 0}
                className="rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
              >
                Donate ₹{amount || 0}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
