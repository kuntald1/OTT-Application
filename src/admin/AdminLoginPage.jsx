import React, { useState } from "react";
import { adminLogin, setAdminToken, adminForgotPassword } from "./adminApi";

const COLORS = {
  bg: "radial-gradient(ellipse at top right, rgba(173,10,10,0.16) 0%, transparent 45%), radial-gradient(ellipse at bottom left, rgba(255,0,0,0.55) 0%, transparent 55%) rgb(48,3,18)",
  panel: "radial-gradient(ellipse at top right, rgba(173,10,10,0.1) 0%, transparent 50%), radial-gradient(ellipse at bottom left, rgba(255,0,0,0.4) 0%, transparent 60%) #150307",
  cream: "#f5ebdd",
  gold: "#D4AF37",
};

export default function AdminLoginPage({ onLoggedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // "login" | "forgot" | "sent"
  const [mode, setMode] = useState("login");

  const handleForgot = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError("");
    setSubmitting(true);
    try {
      await adminForgotPassword(email.trim());
      setMode("sent");
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setError("");
    setSubmitting(true);
    try {
      const data = await adminLogin(email.trim(), password);
      setAdminToken(data.access_token);
      onLoggedIn(data.admin);
    } catch (err) {
      setError(err.message || "Login failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (mode !== "login") {
    return (
      <div
        style={{ background: COLORS.bg, minHeight: "100vh", fontFamily: "'Geist', -apple-system, sans-serif" }}
        className="flex items-center justify-center p-4"
      >
        <form
          onSubmit={handleForgot}
          className="w-full max-w-sm rounded-2xl p-8"
          style={{ background: COLORS.panel, border: "1px solid rgba(212,175,55,0.2)" }}
        >
          <h1 className="mb-1 text-xl font-semibold" style={{ color: COLORS.cream }}>Reset your password</h1>
          {mode === "sent" ? (
            <>
              <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.7)" }}>
                If an account exists for that email, a reset link has been sent.
              </p>
              <button
                type="button"
                onClick={() => { setMode("login"); setError(""); }}
                className="w-full rounded-full px-6 py-2.5 text-sm font-semibold text-black hover:opacity-90"
                style={{ background: COLORS.gold }}
              >
                Back to login
              </button>
            </>
          ) : (
            <>
              <p className="mb-6 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
                Enter your email and we'll send you a link to choose a new password.
              </p>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mb-4 w-full rounded-lg border px-4 py-2.5 text-sm outline-none"
                style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
              />
              {error && <p className="mb-4 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}
              <button
                type="submit"
                disabled={!email.trim() || submitting}
                className="w-full rounded-full px-6 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: COLORS.gold }}
              >
                {submitting ? "Sending…" : "Send reset link"}
              </button>
              <button
                type="button"
                onClick={() => { setMode("login"); setError(""); }}
                className="mt-4 w-full text-center text-xs hover:opacity-80"
                style={{ color: "rgba(245,235,221,0.6)" }}
              >
                Back to login
              </button>
            </>
          )}
        </form>
      </div>
    );
  }

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
        <h1 className="mb-1 text-xl font-semibold" style={{ color: COLORS.cream }}>THEOMY Admin</h1>
        <p className="mb-6 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Staff/Plays Organiser sign-in only.</p>

        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-lg border px-4 py-2.5 text-sm outline-none"
          style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
        />

        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-lg border px-4 py-2.5 text-sm outline-none"
          style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
        />

        <div className="mb-4 -mt-2 text-right">
          <button
            type="button"
            onClick={() => { setMode("forgot"); setError(""); }}
            className="text-xs hover:opacity-80"
            style={{ color: COLORS.gold }}
          >
            Forgot password?
          </button>
        </div>

        {error && <p className="mb-4 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>}

        <button
          type="submit"
          disabled={!email.trim() || !password || submitting}
          className="w-full rounded-full px-6 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: COLORS.gold }}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
