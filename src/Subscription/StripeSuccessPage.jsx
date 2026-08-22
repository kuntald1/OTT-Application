import { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { confirmStripePayment } from "../api";

// Reached when Stripe redirects back after checkout:
// https://theomy.com/stripe/success?session_id=... — App.jsx detects that
// URL on load and renders this instead of the normal app. Independently
// re-verifies the session with Stripe's own API server-side (never trusts
// the redirect alone) before activating the subscription.
export default function StripeSuccessPage({ sessionId, onDone }) {
  const [status, setStatus] = useState("verifying"); // "verifying" | "success" | "error"
  const [error, setError] = useState("");
  const [payment, setPayment] = useState(null);

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      setError("Missing checkout session.");
      return;
    }
    confirmStripePayment(sessionId)
      .then((data) => {
        setPayment(data);
        setStatus("success");
      })
      .catch((err) => {
        setError(err.message || "Couldn't confirm your payment. If money was deducted, contact support.");
        setStatus("error");
      });
  }, [sessionId]);

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: COLORS.blackSoft }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 text-center"
        style={{ background: "rgba(245,235,221,0.04)", border: `1px solid rgba(212,175,55,0.2)` }}
      >
        {status === "verifying" && (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.7)" }}>Confirming your payment…</p>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-10 w-10" style={{ color: "#6FCF97" }} />
            <h1 className="mb-2 text-xl font-semibold" style={{ color: COLORS.cream }}>Payment successful</h1>
            <p className="mb-1 text-sm" style={{ color: "rgba(245,235,221,0.7)" }}>
              {payment?.plan_name} — {payment?.duration_label}
            </p>
            <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.7)" }}>
              ${payment?.total_amount} paid via Stripe. Your subscription is now active.
            </p>
            <button
              onClick={onDone}
              className="w-full rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            >
              Continue to theomy
            </button>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="mx-auto mb-4 h-10 w-10" style={{ color: "#f87171" }} />
            <h1 className="mb-2 text-xl font-semibold" style={{ color: COLORS.cream }}>Something went wrong</h1>
            <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.7)" }}>{error}</p>
            <button
              onClick={onDone}
              className="w-full rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            >
              Back to theomy
            </button>
          </>
        )}
      </div>
    </div>
  );
}
