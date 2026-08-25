import React from "react";
import { X } from "lucide-react";

const COLORS = { panel: "#150307", cream: "#f5ebdd", gold: "#D4AF37" };

// ---------------------------------------------------------------------------
// ConfirmDialog — the ONE confirmation modal every page should use instead
// of window.confirm(). Usage:
//
//   const [confirmTarget, setConfirmTarget] = useState(null); // item or null
//   const [busy, setBusy] = useState(false);
//
//   <button onClick={() => setConfirmTarget(item)}>Delete</button>
//   <ConfirmDialog
//     open={!!confirmTarget}
//     title="Delete this?"
//     message={`Delete "${confirmTarget?.name}"? This can't be undone.`}
//     confirmLabel="Delete"
//     danger
//     busy={busy}
//     onCancel={() => setConfirmTarget(null)}
//     onConfirm={async () => { setBusy(true); await doDelete(confirmTarget); setBusy(false); setConfirmTarget(null); }}
//   />
// ---------------------------------------------------------------------------
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: COLORS.panel, border: "1px solid rgba(212,175,55,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-semibold" style={{ color: COLORS.cream }}>{title}</h3>
          <button type="button" onClick={onCancel} style={{ color: "rgba(245,235,221,0.5)" }} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-5 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>{message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-xs font-medium hover:opacity-80"
            style={{ color: "rgba(245,235,221,0.6)" }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-full px-5 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: danger ? "rgba(248,113,113,0.85)" : COLORS.gold, color: "#0a0104" }}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
