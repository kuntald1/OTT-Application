import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { createOrganiserAccount } from "./adminApi";

const COLORS = { cream: "#f5ebdd", gold: "#D4AF37" };
const INPUT_STYLE = { borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream };

// ---------------------------------------------------------------------------
// "Create organiser" — superadmin creates a Plays Organiser directly. Saved
// as a normal users row (role plays_organiser), not an Admin Account, so the
// organiser logs in on the main site and gets My Video List / Revenue /
// Event Listing Enquiry with the existing APIs (backend:
// routers/admin_users.py create_organiser). No OTP, so the email is NOT
// verified — hence the warning below. Date of birth/city aren't asked here:
// the organiser is prompted for them on first login (which also runs the
// 18+ check).
// ---------------------------------------------------------------------------

export default function CreateOrganiserForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("India");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName(""); setEmail(""); setPassword(""); setPhone(""); setCountry("India"); setError("");
  };

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!name.trim() || !email.trim() || password.length < 8) {
      setError("Name, email and a password of at least 8 characters are required.");
      return;
    }
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const created = await createOrganiserAccount({ name: name.trim(), email: email.trim(), password, phone: phone.trim(), country: country.trim() });
      setNotice(`Organiser created: ${created.email}. They log in on the main site with this email and the password you set.`);
      reset();
      setOpen(false);
      onCreated?.(created);
    } catch (err) {
      setError(err.message || "Couldn't create the organiser.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6">
      {!open && (
        <button
          type="button"
          onClick={() => { setOpen(true); setNotice(""); }}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold"
          style={{ background: COLORS.gold, color: "#0a0104" }}
        >
          <Plus className="h-4 w-4" /> Create organiser
        </button>
      )}

      {notice && <p className="mt-3 text-sm" style={{ color: "#6FCF97" }}>{notice}</p>}

      {open && (
        <form onSubmit={submit} className="rounded-xl border p-4" style={{ borderColor: "rgba(245,235,221,0.1)", background: "rgba(0,0,0,0.2)" }}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>New Plays Organiser</p>
            <button type="button" aria-label="Close" onClick={() => { setOpen(false); reset(); }} style={{ color: "rgba(245,235,221,0.6)" }}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <input type="text" placeholder="Full name" aria-label="Organiser name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border px-3 py-2 text-sm outline-none" style={INPUT_STYLE} />
            <input type="email" placeholder="Email" aria-label="Organiser email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg border px-3 py-2 text-sm outline-none" style={INPUT_STYLE} />
            <input type="password" placeholder="Starting password (min. 8 characters)" aria-label="Organiser password" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-lg border px-3 py-2 text-sm outline-none" style={INPUT_STYLE} />
            <input type="tel" placeholder="Phone (optional)" aria-label="Organiser phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-lg border px-3 py-2 text-sm outline-none" style={INPUT_STYLE} />
            <input type="text" placeholder="Country" aria-label="Organiser country" value={country} onChange={(e) => setCountry(e.target.value)} className="rounded-lg border px-3 py-2 text-sm outline-none" style={INPUT_STYLE} />
          </div>

          <p className="mt-3 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
            The email is not verified — double-check it, or the organiser won't be able to log in or reset their password.
            They'll be asked for date of birth and city the first time they log in.
          </p>

          {error && <p className="mt-3 text-sm" style={{ color: "#f87171" }}>{error}</p>}

          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={saving} className="rounded-lg px-4 py-2 text-sm font-semibold" style={{ background: COLORS.gold, color: "#0a0104", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Creating…" : "Create organiser"}
            </button>
            <button type="button" onClick={() => { setOpen(false); reset(); }} disabled={saving} className="rounded-lg px-4 py-2 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
