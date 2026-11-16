import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Check, Copy, Gift, Mail, MessageCircle, Send, Share2, Users,
} from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { fetchMyReferral, shareReferral } from "../api";

// ---------------------------------------------------------------------------
// Refer & Earn — reached from the profile menu, for customers and Plays
// Organisers alike. Shows this account's code and link, lets them send it
// by email or WhatsApp, and reports how their own referrals are doing.
//
// Everything on screen comes from GET /referrals/me, including the point
// values — those are set in Admin > Reward Points and must never be
// hardcoded here, or the page would promise a number the backend has
// stopped paying.
// ---------------------------------------------------------------------------

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
};

function CopyButton({ value, label }) {
  const [done, setDone] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Older browsers, and any page not served over https, refuse the
      // clipboard. Fall back to selecting the text so the person can
      // copy it by hand rather than pressing a button that does nothing.
      const el = document.createElement("textarea");
      el.value = value;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      try { document.execCommand("copy"); } catch { /* nothing more to try */ }
      document.body.removeChild(el);
    }
    setDone(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 2000);
  };

  return (
    <button
      type="button" onClick={copy}
      className="flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold"
      style={{ border: `1px solid ${COLORS.gold}`, color: done ? "#6FCF97" : COLORS.gold }}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? "Copied" : label}
    </button>
  );
}

function SendBox({ onSent }) {
  const [channel, setChannel] = useState("whatsapp");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");

  const isEmail = channel === "email";

  const submit = async (e) => {
    e.preventDefault();
    if (busy || !to.trim()) return;
    setBusy(true);
    setError("");
    setSentTo("");
    try {
      const res = await shareReferral({ channel, to: to.trim() });
      setSentTo(res.to || to.trim());
      setTo("");
      onSent?.();
    } catch (err) {
      setError(err.message || "Couldn't send it. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="mb-3 flex gap-2">
        {[
          { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
          { id: "email", label: "Email", icon: Mail },
        ].map((c) => {
          const Icon = c.icon;
          const active = channel === c.id;
          return (
            <button
              key={c.id} type="button"
              onClick={() => { setChannel(c.id); setError(""); setSentTo(""); }}
              className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold"
              style={active
                ? { background: COLORS.gold, color: CTA_TEXT_COLOR }
                : { border: "1px solid rgba(245,235,221,0.2)", color: "rgba(245,235,221,0.7)" }}
            >
              <Icon className="h-3.5 w-3.5" /> {c.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          id="refer-send-to"
          type={isEmail ? "email" : "tel"}
          inputMode={isEmail ? "email" : "tel"}
          value={to}
          onChange={(e) => { setTo(e.target.value); setError(""); setSentTo(""); }}
          placeholder={isEmail ? "friend@example.com" : "Phone number with WhatsApp"}
          className="min-w-0 flex-1 rounded-lg px-4 py-3 text-sm outline-none"
          style={{
            background: "rgba(0,0,0,0.25)", border: "1px solid rgba(245,235,221,0.15)",
            color: COLORS.cream,
          }}
        />
        <button
          type="submit" disabled={busy || !to.trim()}
          className="flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
        >
          <Send className="h-4 w-4" /> {busy ? "Sending…" : "Send invite"}
        </button>
      </div>

      {!isEmail && (
        <p className="mt-2 text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>
          Indian numbers need no country code. For anywhere else, start with +.
        </p>
      )}
      {error && <p className="mt-2 text-xs font-medium" style={{ color: COLORS.burgundyLight }}>{error}</p>}
      {sentTo && (
        <p className="mt-2 text-xs font-medium" style={{ color: "#6FCF97" }}>
          Invite sent to {sentTo}.
        </p>
      )}
    </form>
  );
}

export default function ReferEarnPage({ onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => fetchMyReferral().then(setData);

  useEffect(() => {
    let cancelled = false;
    fetchMyReferral()
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err.message || "Couldn't load your referral code."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const shell = (children) => (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className="mx-auto max-w-2xl px-6 pb-16 pt-24 sm:px-10 sm:pt-28">
        <button
          type="button" onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
          style={{ color: COLORS.gold }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        {children}
      </main>
    </div>
  );

  if (loading) {
    return shell(<p className="text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>Loading…</p>);
  }
  if (!data) {
    return shell(
      <>
        <h1 className="mb-2 text-3xl font-semibold" style={{ color: COLORS.cream }}>Refer &amp; Earn</h1>
        <p className="text-sm" style={{ color: COLORS.burgundyLight }}>{error}</p>
      </>,
    );
  }

  const card = {
    background: COLORS.blackSoft,
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16,
  };

  return shell(
    <>
      <h1 className="mb-1 flex items-center gap-2 text-3xl font-semibold" style={{ color: COLORS.cream }}>
        <Gift className="h-7 w-7" style={{ color: COLORS.gold }} /> Refer &amp; Earn
      </h1>
      <p className="mb-8 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
        Share your invite. When a friend joins with it and takes their first subscription, you get{" "}
        <strong style={{ color: COLORS.gold }}>{data.referrer_reward_points} points</strong> and they get{" "}
        <strong style={{ color: COLORS.gold }}>{data.referred_reward_points}</strong>. Points come straight
        off what you pay next time.
      </p>

      {/* ----------------------------------------------------- the code */}
      <div className="mb-4 p-6 text-center" style={{ ...card, border: `1px solid ${COLORS.gold}55` }}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(245,235,221,0.55)" }}>
          Your invite code
        </p>
        <p className="mb-4 text-4xl font-bold" style={{ color: COLORS.gold, letterSpacing: "0.25em" }}>
          {data.code}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <CopyButton value={data.code} label="Copy code" />
          <CopyButton value={data.share_url} label="Copy link" />
        </div>
        <p className="mt-4 text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>
          Good until {fmtDate(data.expires_at)}. After that you'll be given a fresh code here, and this
          one stops working.
        </p>
      </div>

      {/* ---------------------------------------------------- sending it */}
      <div className="mb-4 p-6" style={card}>
        <p className="mb-1 flex items-center gap-2 text-base font-semibold" style={{ color: COLORS.cream }}>
          <Share2 className="h-4 w-4" style={{ color: COLORS.gold }} /> Send it to someone
        </p>
        <p className="mb-4 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
          We'll send them the invite with your name on it. Tapping the link opens the sign-up form with
          your code already filled in.
        </p>
        <SendBox onSent={() => load().catch(() => {})} />
      </div>

      {/* -------------------------------------------------- how it works */}
      <div className="mb-4 p-6" style={card}>
        <p className="mb-4 text-base font-semibold" style={{ color: COLORS.cream }}>How it works</p>
        {[
          "Send your link or code to a friend.",
          "They create a theomy account with it.",
          `They take their first subscription — then ${data.referrer_reward_points} points land in your account and ${data.referred_reward_points} in theirs.`,
        ].map((step, i) => (
          <div key={step} className="mb-3 flex gap-3 last:mb-0">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
              style={{ background: "rgba(212,175,55,0.15)", color: COLORS.gold }}
            >
              {i + 1}
            </span>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(245,235,221,0.75)" }}>{step}</p>
          </div>
        ))}
        <p className="mt-4 text-xs leading-relaxed" style={{ color: "rgba(245,235,221,0.45)" }}>
          Nothing is credited for sharing or for signing up on its own — the subscription is what pays.
          An invite works once per person, and not for anyone who has subscribed to theomy before.
        </p>
      </div>

      {/* ------------------------------------------------------- results */}
      <div className="p-6" style={card}>
        <p className="mb-4 flex items-center gap-2 text-base font-semibold" style={{ color: COLORS.cream }}>
          <Users className="h-4 w-4" style={{ color: COLORS.gold }} /> Your referrals
        </p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Joined", value: data.signed_up },
            { label: "Subscribed", value: data.rewarded },
            { label: "Points earned", value: data.points_earned, accent: true },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-4 text-center" style={{ background: "rgba(0,0,0,0.25)" }}>
              <p className="text-2xl font-semibold"
                 style={{ color: s.accent ? COLORS.gold : COLORS.cream, fontVariantNumeric: "tabular-nums" }}>
                {s.value}
              </p>
              <p className="mt-1 text-[11px]" style={{ color: "rgba(245,235,221,0.5)" }}>{s.label}</p>
            </div>
          ))}
        </div>
        {data.signed_up === 0 && (
          <p className="mt-4 text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>
            No one has joined with your code yet. Send it to a friend who'd enjoy a play.
          </p>
        )}
      </div>
    </>,
  );
}
