import React, { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { fetchFamilyAccounts, setFamilyPin } from "../api";
import PinField, { isCompletePin } from "./PinField";

// ---------------------------------------------------------------------------
// Family PIN — set or change it from Manage Profile (Family Accounts card).
// The PIN is what a family member must enter to get back into THIS account
// from "Who's watching?". First time: just the new PIN. Changing it: the
// current one too (the server locks after 5 wrong tries, like a switch).
// ---------------------------------------------------------------------------

export default function FamilyPinSection() {
  const [pinSet, setPinSet] = useState(null); // null while loading
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchFamilyAccounts()
      .then((r) => setPinSet(r.pin_set))
      .catch(() => setPinSet(false));
  }, []);

  const reset = () => {
    setCurrent(""); setNext(""); setConfirm(""); setError("");
  };

  const save = async () => {
    if (busy) return;
    if (pinSet && !isCompletePin(current)) { setError("Enter your current 4-digit PIN."); return; }
    if (!isCompletePin(next)) { setError("Choose a 4-digit PIN."); return; }
    if (next !== confirm) { setError("The two PINs don't match."); return; }
    setError("");
    setBusy(true);
    try {
      await setFamilyPin({ newPin: next, currentPin: pinSet ? current : undefined });
      setPinSet(true);
      setSaved(true);
      setEditing(false);
      reset();
    } catch (err) {
      setError(err.message || "Couldn't save the PIN. Please try again.");
      setCurrent("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 rounded-lg p-4" style={{ background: "rgba(245,235,221,0.03)", border: "1px solid rgba(245,235,221,0.08)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium" style={{ color: COLORS.cream }}>
            <KeyRound className="h-3.5 w-3.5" style={{ color: COLORS.gold }} /> Family PIN
            {pinSet !== null && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={pinSet ? { background: "rgba(111,207,151,0.15)", color: "#6FCF97" } : { background: "rgba(248,113,113,0.15)", color: "#f87171" }}
              >
                {pinSet ? "Set" : "Not set"}
              </span>
            )}
          </p>
          <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
            Needed to get back into your account from a family account. Forgot it? Contact support to reset it.
          </p>
        </div>
        {!editing && pinSet !== null && (
          <button
            type="button"
            onClick={() => { setEditing(true); setSaved(false); }}
            className="rounded-full px-4 py-1.5 text-xs font-semibold"
            style={{ border: "1px solid rgba(212,175,55,0.4)", color: COLORS.gold }}
          >
            {pinSet ? "Change PIN" : "Set PIN"}
          </button>
        )}
      </div>

      {saved && !editing && (
        <p className="mt-3 text-xs font-medium" role="status" style={{ color: "#6FCF97" }}>Family PIN saved.</p>
      )}

      {editing && (
        <div className="mt-4 flex flex-col gap-3">
          {pinSet && (
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Current PIN</span>
              <PinField value={current} onChange={setCurrent} onEnter={save} disabled={busy} ariaLabel="Current PIN" autoFocus />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>New PIN</span>
            <PinField value={next} onChange={setNext} onEnter={save} disabled={busy} ariaLabel="New PIN" autoFocus={!pinSet} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Confirm new PIN</span>
            <PinField value={confirm} onChange={setConfirm} onEnter={save} disabled={busy} ariaLabel="Confirm new PIN" />
          </label>
          {error && <p className="text-xs font-medium" role="alert" style={{ color: "#f87171" }}>{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-full px-5 py-2 text-xs font-semibold disabled:opacity-60"
              style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            >
              {busy ? "Saving…" : "Save PIN"}
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); reset(); }}
              disabled={busy}
              className="rounded-full px-4 py-2 text-xs font-medium disabled:opacity-50"
              style={{ color: "rgba(245,235,221,0.5)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
