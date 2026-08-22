import React, { useState } from "react";
import { adminLogin, setAdminToken } from "./adminApi";

const COLORS = {
  bg: "#0a0104",
  panel: "#150307",
  cream: "#f5ebdd",
  gold: "#D4AF37",
};

export default function AdminLoginPage({ onLoggedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

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
        <h1 className="mb-1 text-xl font-semibold" style={{ color: COLORS.cream }}>theomy Admin</h1>
        <p className="mb-6 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Staff sign-in only.</p>

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
