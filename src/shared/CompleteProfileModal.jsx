import React, { useState } from "react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { useApp } from "../context/AppContext";
import CityDropdown from "./CityDropdown";

// ---------------------------------------------------------------------------
// CompleteProfileModal — the one-time prompt for date of birth (+ city, for
// India accounts) on any account that doesn't have them yet: a main account
// created before this feature shipped, a Google/Facebook/OTP signup (which
// never went through the registration form), or a sub-account its parent
// declared an ADULT (routers/sub_accounts.py) filling in its own details.
//
// Deliberately not dismissible without submitting (per the confirmed
// decision that these fields are mandatory) — there is no "skip" or close
// button. A declared-minor sub-account never sees this at all; AppContext
// only opens it when demographics-status says needs_profile is true.
// ---------------------------------------------------------------------------

export default function CompleteProfileModal() {
  const { isLoggedIn, needsProfileCompletion, profile, completeDemographics } = useApp();
  const [dob, setDob] = useState("");
  const [city, setCity] = useState("");
  const [gender, setGender] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isLoggedIn || !needsProfileCompletion) return null;

  const isIndia = profile.country === "India";

  const submit = async () => {
    if (busy) return;
    if (!dob) { setError("Please enter your date of birth."); return; }
    if (isIndia && !city.trim()) { setError("Please select your city."); return; }
    setError("");
    setBusy(true);
    try {
      await completeDemographics({ date_of_birth: dob, city: isIndia ? city.trim() : undefined, gender: gender || undefined });
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Complete your profile"
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      style={{ background: "rgba(10,1,4,0.85)", fontFamily: "'Geist', -apple-system, sans-serif" }}
    >
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.2)" }}>
        <h2 className="mb-1 text-xl font-semibold" style={{ color: COLORS.cream }}>Complete your profile</h2>
        <p className="mb-4 text-xs" style={{ color: "rgba(245,235,221,0.55)" }}>
          A couple of quick details before you continue — this helps us understand who's watching theomy.
        </p>

        <div className="flex flex-col gap-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Date of birth</span>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              disabled={busy}
              aria-label="Date of birth"
              max={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-lg border px-4 py-2.5 text-sm outline-none disabled:opacity-50"
              style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream, colorScheme: "dark" }}
            />
          </label>

          {isIndia && (
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>City</span>
              <CityDropdown value={city} onChange={setCity} disabled={busy} />
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Gender (optional)</span>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              disabled={busy}
              aria-label="Gender"
              className="w-full rounded-lg border px-4 py-2.5 text-sm outline-none disabled:opacity-50"
              style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream, colorScheme: "dark" }}
            >
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>

        {error && <p className="mt-3 text-xs font-medium" role="alert" style={{ color: "#f87171" }}>{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="mt-4 w-full rounded-full px-6 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
        >
          {busy ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
