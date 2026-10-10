import React, { useState } from "react";
import { adminResetPassword } from "./adminApi";

const COLORS = {
  bg: "radial-gradient(ellipse at top right, rgba(173,10,10,0.16) 0%, transparent 45%), radial-gradient(ellipse at bottom left, rgba(255,0,0,0.55) 0%, transparent 55%) rgb(48,3,18)",
  panel: "radial-gradient(ellipse at top right, rgba(173,10,10,0.1) 0%, transparent 50%), radial-gradient(ellipse at bottom left, rgba(255,0,0,0.4) 0%, transparent 60%) #150307",
  cream: "#f5ebdd",
  gold: "#D4AF37",
};

// Reached from the Admin Portal reset email: /admin/reset-password?token=...
export default function AdminResetPasswordPage({ token, onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const canSubmit = password.length >= 8 && password === confirm;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setError("");
    setSubmitting(true);
    try {
      await adminResetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = { borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream };

  return (
    <div
      style={{ background: COLORS.bg, minHeight: "100vh", fontFamily: "'Geist', -apple-system, sans-serif" }}
      className="flex items-center justify-center p-4"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl p-8"
        style={{ background: COLORS.panel, border: "1px solid rgba(212,175,55,0.2)" }}
      >
        <h1 className="mb-1 text-xl font-semibold" style={{ color: COLORS.cream }}>Reset your password</h1>
        {success ? (
          <>
            <p className="mb-6 mt-2 text-sm" style={{ color: "rgba(245,235,221,0.7)" }}>
              Your password has been reset. You can now log in with your new password.
            </p>
            <button
              type="button"
              onClick={onDone}
              className="w-full rounded-full px-6 py-2.5 text-sm font-semibold text-black hover:opacity-90"
              style={{ background: COLORS.gold }}
            >
              Go to login
            </button>
          </>
        ) : (
          <>
            <p className="mb-6 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Choose a new password for your Admin Portal account.</p>
            <input
              type="password"
              placeholder="New password (min. 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mb-3 w-full rounded-lg border px-4 py-2.5 text-sm outline-none"
              style={inputStyle}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mb-4 w-full rounded-lg border px-4 py-2.5 text-sm outline-none"
              style={inputStyle}
            />
            {confirm && password !== confirm && (
              <p className="mb-4 text-xs font-medium" style={{ color: "#f87171" }}>Passwords don't match.</p>
            )}
            {error && <p className="mb-4 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="w-full rounded-full px-6 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: COLORS.gold }}
            >
              {submitting ? "Saving…" : "Reset password"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
