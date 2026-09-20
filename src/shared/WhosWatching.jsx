import React, { useEffect, useState } from "react";
import { Lock, X } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { useApp } from "../context/AppContext";
import { fetchFamilyAccounts, switchFamilyAccount, setFamilyPin } from "../api";
import PinField, { isCompletePin } from "./PinField";

// ---------------------------------------------------------------------------
// "Who's watching?" — full-screen account picker for a family (a main account
// plus the sub-accounts it created). Opens by itself right after a real login
// when the account has a family, and from "Switch account" in the profile menu.
//
// The rules live on the server (routers/family.py) — this only mirrors them:
//   * main account -> one of its family members: one click, no PIN.
//   * family member -> back into the main account: needs the Family PIN.
//   * before the FIRST family member is entered, the main account must have a
//     PIN (otherwise there'd be no safe way back), so it is asked for first.
// ---------------------------------------------------------------------------

export default function WhosWatching({ onNavigate }) {
  const { isLoggedIn, familyPickerOpen, closeFamilyPicker, applyAccountSwitch } = useApp();
  const open = familyPickerOpen && isLoggedIn;

  const [data, setData] = useState(null); // { accounts, pin_set }
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [dialog, setDialog] = useState(null); // null | { mode: "enter" | "create", account }
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    setDialog(null);
    setNotice("");
    fetchFamilyAccounts()
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => { if (!cancelled) setLoadError(e.message || "Couldn't load your accounts."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape" && !dialog) closeFamilyPicker(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dialog, closeFamilyPicker]);

  if (!open) return null;

  // Resolves to an error message (shown inside the dialog) or null on success.
  const switchTo = async (account, pin) => {
    try {
      const res = await switchFamilyAccount(account.id, pin);
      applyAccountSwitch(res); // also closes this picker
      onNavigate?.("hero");
      return null;
    } catch (err) {
      return err.message || "Couldn't switch accounts. Please try again.";
    }
  };

  const pick = async (account) => {
    setNotice("");
    if (account.is_current) {
      closeFamilyPicker();
      return;
    }
    if (account.requires_pin) {
      if (!data.pin_set) {
        setNotice(`${account.name} hasn't set a Family PIN yet. Ask them to set one in Manage Profile, then try again.`);
        return;
      }
      setDialog({ mode: "enter", account });
      return;
    }
    if (!data.pin_set) {
      setDialog({ mode: "create", account });
      return;
    }
    const message = await switchTo(account, null);
    if (message) setNotice(message);
  };

  const submitPin = async (pin) => {
    if (dialog.mode === "create") {
      try {
        await setFamilyPin({ newPin: pin });
      } catch (err) {
        return err.message || "Couldn't save the PIN. Please try again.";
      }
      setData((d) => ({ ...d, pin_set: true }));
      return switchTo(dialog.account, null);
    }
    return switchTo(dialog.account, pin);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Who's watching?"
      className="fixed inset-0 z-[100] flex flex-col items-center overflow-y-auto px-6 py-16"
      style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif" }}
    >
      <button
        type="button"
        onClick={closeFamilyPicker}
        aria-label="Close"
        className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full hover:opacity-80"
        style={{ color: "rgba(245,235,221,0.7)", border: "1px solid rgba(245,235,221,0.2)" }}
      >
        <X className="h-4 w-4" />
      </button>

      <h1 className="mb-10 mt-8 text-3xl font-semibold sm:text-4xl" style={{ color: COLORS.cream }}>
        Who's watching?
      </h1>

      {loading ? (
        <p className="text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>Loading…</p>
      ) : loadError ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm" style={{ color: "#f87171" }}>{loadError}</p>
          <button
            type="button"
            onClick={closeFamilyPicker}
            className="rounded-full px-5 py-2 text-sm font-semibold"
            style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
          >
            Continue
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap justify-center gap-6 sm:gap-8">
            {data.accounts.map((account) => (
              <AccountTile
                key={account.id}
                account={account}
                pinMissing={account.requires_pin && !data.pin_set}
                onClick={() => pick(account)}
              />
            ))}
          </div>
          {notice && (
            <p className="mt-8 max-w-md text-center text-sm" role="alert" style={{ color: COLORS.gold }}>
              {notice}
            </p>
          )}
        </>
      )}

      {dialog && (
        <PinDialog
          mode={dialog.mode}
          account={dialog.account}
          onCancel={() => setDialog(null)}
          onSubmit={submitPin}
        />
      )}
    </div>
  );
}

function AccountTile({ account, pinMissing, onClick }) {
  const initial = (account.name || "?")[0].toUpperCase();
  const caption = account.is_current ? "Current" : account.is_parent ? "Main account" : "Family member";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${account.name}${account.requires_pin ? " (PIN required)" : ""}`}
      className="group flex w-32 flex-col items-center gap-2 text-center sm:w-40"
      style={{ opacity: pinMissing ? 0.55 : 1 }}
    >
      <div
        className="relative h-28 w-28 overflow-hidden rounded-lg transition-transform duration-200 group-hover:scale-105 sm:h-36 sm:w-36"
        style={{
          background: "rgba(245,235,221,0.08)",
          boxShadow: account.is_current ? `0 0 0 3px ${COLORS.gold}` : "0 0 0 1px rgba(255,255,255,0.14)",
        }}
      >
        {account.photo_url ? (
          <img src={account.photo_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-5xl font-semibold" style={{ color: COLORS.cream }}>
            {initial}
          </span>
        )}
        {account.requires_pin && (
          <span
            className="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full"
            style={{ background: "rgba(0,0,0,0.65)", color: COLORS.gold }}
          >
            <Lock className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <span className="w-full truncate text-sm font-medium" style={{ color: COLORS.cream }}>{account.name}</span>
      <span className="text-[11px]" style={{ color: "rgba(245,235,221,0.5)" }}>
        {pinMissing ? "PIN not set" : caption}
      </span>
    </button>
  );
}

// mode "enter":  ask for the Family PIN to get into the main account.
// mode "create": the main account has no PIN yet — set one before entering a
//                family member, so there is always a protected way back.
function PinDialog({ mode, account, onCancel, onSubmit }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const creating = mode === "create";

  const submit = async () => {
    if (busy) return;
    if (!isCompletePin(pin)) {
      setError(creating ? "Choose a 4-digit PIN." : "Enter the 4-digit PIN.");
      return;
    }
    if (creating && pin !== confirm) {
      setError("The two PINs don't match.");
      return;
    }
    setError("");
    setBusy(true);
    const message = await onSubmit(pin);
    setBusy(false);
    if (message) {
      setError(message);
      setPin("");
      setConfirm("");
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center px-6" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={creating ? "Set a Family PIN" : "Enter Family PIN"}
        className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.25)" }}
      >
        <h2 className="mb-1 text-lg font-semibold" style={{ color: COLORS.cream }}>
          {creating ? "Set a Family PIN first" : `Enter PIN for ${account.name}`}
        </h2>
        <p className="mb-5 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
          {creating
            ? "You'll need this PIN to come back to your own account from a family account."
            : "Enter the 4-digit Family PIN to open this account."}
        </p>

        <div className="mb-3">
          <PinField value={pin} onChange={setPin} onEnter={submit} autoFocus disabled={busy} ariaLabel={creating ? "New PIN" : "Family PIN"} />
        </div>
        {creating && (
          <div className="mb-3">
            <PinField value={confirm} onChange={setConfirm} onEnter={submit} disabled={busy} ariaLabel="Confirm PIN" placeholder="Confirm" />
          </div>
        )}

        {error && (
          <p className="mb-3 text-center text-xs font-medium" role="alert" style={{ color: "#f87171" }}>{error}</p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50" style={{ color: "rgba(245,235,221,0.6)" }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-60"
            style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
          >
            {busy ? "Checking…" : creating ? "Save & continue" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
