import React, { useState } from "react";
import { CheckCircle2, ArrowLeft } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { useApp } from "../context/AppContext";

// ---------------------------------------------------------------------------
// Manage Profile — reached from the profile menu. Edits photo, name, email
// via AppContext's updateProfile()/changePhoto().
// ---------------------------------------------------------------------------

export default function ManageProfilePage({ onBack }) {
  const { profile, changePhoto, updateProfile } = useApp();
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    updateProfile({ name: name.trim(), email: email.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const inputStyle = {
    width: "100%",
    borderRadius: 10,
    border: "1px solid rgba(245,235,221,0.15)",
    background: "rgba(245,235,221,0.05)",
    color: COLORS.cream,
    padding: "10px 14px",
    fontSize: 14,
    outline: "none",
  };

  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className="mx-auto max-w-xl px-6 pb-16 pt-24 sm:px-10 sm:pt-28">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
          style={{ color: COLORS.gold }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="mb-1 text-3xl font-semibold" style={{ color: COLORS.cream }}>Manage Profile</h1>
        <p className="mb-8 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>Update your photo, name, and email.</p>

        <div className="rounded-2xl p-6" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="mb-6 flex items-center gap-4">
            <div
              className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border text-lg font-semibold"
              style={{ borderColor: "rgba(212,175,55,0.4)", color: COLORS.cream }}
            >
              {profile.photo ? (
                <img src={profile.photo} alt="" className="h-full w-full object-cover" />
              ) : (
                (profile.name || "?")[0]?.toUpperCase()
              )}
            </div>
            <label
              className="cursor-pointer rounded-full px-4 py-2 text-sm font-medium"
              style={{ border: `1px solid ${COLORS.gold}`, color: COLORS.gold }}
            >
              Change photo
              <input type="file" accept="image/*" className="hidden" onChange={(e) => changePhoto(e.target.files?.[0])} />
            </label>
          </div>

          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </div>
          <div className="mb-6">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              disabled={!name.trim() || !email.trim()}
              onClick={handleSave}
              className="rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            >
              Save changes
            </button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm" style={{ color: "#6FCF97" }}>
                <CheckCircle2 className="h-4 w-4" /> Saved
              </span>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
