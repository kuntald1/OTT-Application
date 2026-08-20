import React, { useState } from "react";
import { MessageSquare, Phone, FileWarning, CheckCircle2, ArrowLeft } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { useApp } from "../context/AppContext";

// ---------------------------------------------------------------------------
// Help Center — reached from the profile menu. Three tabs: Message, Call,
// Complain. Complain generates a ticket (stored in AppContext) with a
// ticket number, details, and status — demo-only, no real support backend.
// ---------------------------------------------------------------------------

const TABS = [
  { id: "message", label: "Message", icon: MessageSquare },
  { id: "call", label: "Call", icon: Phone },
  { id: "complain", label: "Complain", icon: FileWarning },
];

export default function HelpCenterPage({ onBack }) {
  const [tab, setTab] = useState("message");

  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className="mx-auto max-w-2xl px-6 pb-16 pt-24 sm:px-10 sm:pt-28">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
          style={{ color: COLORS.gold }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="mb-1 text-3xl font-semibold" style={{ color: COLORS.cream }}>Help Center</h1>
        <p className="mb-8 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
          Send a message, call us, or raise a complaint — we'll track it with a ticket number.
        </p>

        <div className="mb-8 flex gap-2 rounded-full p-1.5" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-colors"
                style={active ? { background: CTA_GRADIENT, color: CTA_TEXT_COLOR } : { color: "rgba(245,235,221,0.7)" }}
              >
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </div>

        {tab === "message" && <MessageTab />}
        {tab === "call" && <CallTab />}
        {tab === "complain" && <ComplainTab />}
      </main>
    </div>
  );
}

function Card({ children }) {
  return (
    <div className="rounded-2xl p-6" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  borderRadius: 10,
  border: "1px solid rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)",
  color: COLORS.cream,
  padding: "10px 14px",
  fontSize: 14,
  outline: "none",
};

function MessageTab() {
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 className="h-10 w-10" style={{ color: COLORS.gold }} />
          <p className="text-base font-semibold" style={{ color: COLORS.cream }}>Message sent</p>
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>We'll get back to you by email within 24 hours.</p>
          <button type="button" onClick={() => { setSent(false); setMessage(""); }} className="mt-2 text-sm font-medium hover:opacity-80" style={{ color: COLORS.gold }}>
            Send another message
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <Field label="Your message">
        <textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="How can we help?" style={{ ...inputStyle, resize: "vertical" }} />
      </Field>
      <button
        type="button"
        disabled={!message.trim()}
        onClick={() => setSent(true)}
        className="rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
      >
        Send message
      </button>
    </Card>
  );
}

function CallTab() {
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(212,175,55,0.12)" }}>
          <Phone className="h-6 w-6" style={{ color: COLORS.gold }} />
        </div>
        <p className="text-base font-semibold" style={{ color: COLORS.cream }}>+91 33 4000 1234</p>
        <p className="max-w-xs text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
          Mon–Sat, 10:00 AM – 7:00 PM IST
        </p>
        <a
          href="tel:+913340001234"
          className="mt-2 rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
        >
          Call Now
        </a>
      </div>
    </Card>
  );
}

const STATUS_COLORS = {
  Open: COLORS.gold,
  "In Progress": "#5B9BD5",
  Resolved: "#6FCF97",
};

function ComplainTab() {
  const { addTicket, tickets } = useApp();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [lastTicket, setLastTicket] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    setSubmitting(true);
    try {
      const ticket = await addTicket(subject.trim(), description.trim());
      setLastTicket(ticket);
      setSubject("");
      setDescription("");
    } catch (err) {
      setError(err.message || "Couldn't submit your complaint. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        {lastTicket && (
          <div className="mb-5 rounded-xl p-4" style={{ background: "rgba(212,175,55,0.1)", border: `1px solid rgba(212,175,55,0.3)` }}>
            <p className="text-sm font-semibold" style={{ color: COLORS.gold }}>Ticket {lastTicket.id} created</p>
            <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.6)" }}>We'll update the status here as it's handled.</p>
          </div>
        )}
        <Field label="Subject">
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief summary" style={inputStyle} />
        </Field>
        <Field label="Details">
          <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the issue" style={{ ...inputStyle, resize: "vertical" }} />
        </Field>
        {error && (
          <p className="mb-3 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>
        )}
        <button
          type="button"
          disabled={!subject.trim() || !description.trim() || submitting}
          onClick={handleSubmit}
          className="rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
        >
          {submitting ? "Submitting…" : "Submit complaint"}
        </button>
      </Card>

      {tickets.length > 0 && (
        <div>
          <p className="mb-3 text-sm font-semibold" style={{ color: COLORS.cream }}>Your tickets</p>
          <div className="flex flex-col gap-3">
            {tickets.map((t) => (
              <div key={t.id} className="rounded-xl p-4" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>{t.id}</p>
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: "rgba(255,255,255,0.08)", color: STATUS_COLORS[t.status] || COLORS.gold }}>
                    {t.status}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-medium" style={{ color: "rgba(245,235,221,0.85)" }}>{t.subject}</p>
                <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.55)" }}>{t.description}</p>
                <p className="mt-2 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>Filed {t.date}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
