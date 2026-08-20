import { useState } from "react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { resetPassword } from "../api";

// Reached when someone clicks the link from the "reset your password"
// email: https://theomy.com/reset-password?token=... — App.jsx detects
// that URL on load and renders this instead of the normal app.
export default function ResetPasswordPage({ token, onDone }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const canSubmit = password.length >= 8 && password === confirmPassword;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setError("");
    setSubmitting(true);
    try {
      await resetPassword({ token, newPassword: password });
      setSuccess(true);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: COLORS.blackSoft }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: "rgba(245,235,221,0.04)", border: `1px solid rgba(212,175,55,0.2)` }}
      >
        <h1 className="mb-1 text-xl font-semibold" style={{ color: COLORS.cream }}>
          Reset your password
        </h1>

        {success ? (
          <>
            <p className="mb-4 mt-2 text-sm" style={{ color: "rgba(245,235,221,0.7)" }}>
              Your password has been reset. You can now log in with your new password.
            </p>
            <button
              onClick={onDone}
              className="w-full rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            >
              Go to login
            </button>
          </>
        ) : (
          <>
            <p className="mb-4 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
              Choose a new password for your theomy account.
            </p>

            <div className="flex flex-col gap-3">
              <input
                type="password"
                placeholder="New password (min. 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-lg border px-4 py-2.5 text-sm outline-none"
                style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="rounded-lg border px-4 py-2.5 text-sm outline-none"
                style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
              />

              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs font-medium" style={{ color: "#f87171" }}>
                  Passwords don't match.
                </p>
              )}
              {error && (
                <p className="text-xs font-medium" style={{ color: "#f87171" }}>
                  {error}
                </p>
              )}

              <button
                disabled={!canSubmit || submitting}
                onClick={handleSubmit}
                className="mt-1 rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
              >
                {submitting ? "Resetting…" : "Reset password"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
