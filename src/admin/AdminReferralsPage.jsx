import React, { useEffect, useState } from "react";
import { Mail, MessageCircle, Send, Share2, X } from "lucide-react";
import {
  cancelAdminReferral, cancelAdminReferralCode, fetchAdminReferralCodes,
  fetchAdminReferralInvites, fetchAdminReferrals, sendAdminReferralInvite,
} from "./adminApi";

const COLORS = { cream: "#f5ebdd", gold: "#D4AF37", green: "#6FCF97" };

const card = {
  background: "rgba(0,0,0,0.2)",
  border: "1px solid rgba(245,235,221,0.1)",
  borderRadius: 12,
};
const th = {
  textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.03em",
  color: "rgba(245,235,221,0.5)", borderBottom: "1px solid rgba(245,235,221,0.1)",
  whiteSpace: "nowrap",
};
const td = {
  padding: "10px 12px", fontSize: 13, color: COLORS.cream,
  borderBottom: "1px solid rgba(245,235,221,0.06)", verticalAlign: "top",
};

const STATUS = {
  registered: { label: "Signed up", color: "#E0A458", hint: "No subscription yet" },
  rewarded: { label: "Rewarded", color: COLORS.green, hint: "First subscription paid" },
  cancelled: { label: "Cancelled", color: "#f87171", hint: "Will not pay out" },
};

const btn = {
  borderRadius: 999, padding: "5px 12px", fontSize: 11, fontWeight: 600,
  cursor: "pointer", whiteSpace: "nowrap",
};
const ghostBtn = {
  ...btn, background: "transparent", color: "#f87171",
  border: "1px solid rgba(248,113,113,0.4)",
};

// Dates land as UTC from the API; show them the way an admin in Kolkata
// reads them, rather than making them do the arithmetic.
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

function Stat({ label, value, hint, accent }) {
  return (
    <div style={{ ...card, padding: "14px 16px", minWidth: 0 }}>
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>{label}</p>
      <p className="mt-1 text-2xl font-semibold" style={{ color: accent || COLORS.cream, fontVariantNumeric: "tabular-nums" }}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>{hint}</p>}
    </div>
  );
}

// Sending a code from admin. The invite goes out in the code OWNER's
// name, not the admin's — that is whose code it is, and whose name the
// person receiving it will recognise.
function SendDialog({ code, onClose, onSent }) {
  const [channel, setChannel] = useState("email");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (busy || !to.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await sendAdminReferralInvite({ code: code.code, channel, to: to.trim() });
      onSent(`Invite sent to ${res.to} on behalf of ${res.on_behalf_of}.`);
    } catch (err) {
      setError(err.message || "Couldn't send it.");
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: "#190409", border: "1px solid rgba(245,235,221,0.14)" }}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <p className="text-base font-semibold" style={{ color: COLORS.cream }}>Send this invite</p>
          <button type="button" onClick={onClose} aria-label="Close"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(245,235,221,0.5)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-5 text-[11px]" style={{ color: "rgba(245,235,221,0.5)" }}>
          Code <strong style={{ color: COLORS.gold }}>{code.code}</strong>, belonging to {code.owner_name}.
          It goes out in their name.
        </p>

        <div className="mb-3 flex gap-2">
          {[
            { id: "email", label: "Email", icon: Mail },
            { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
          ].map((c) => {
            const Icon = c.icon;
            const active = channel === c.id;
            return (
              <button
                key={c.id} type="button"
                onClick={() => { setChannel(c.id); setError(""); }}
                className="flex items-center gap-1.5"
                style={active
                  ? { ...btn, background: COLORS.gold, color: "#0a0104", border: "none" }
                  : { ...btn, background: "transparent", color: "rgba(245,235,221,0.7)", border: "1px solid rgba(245,235,221,0.2)" }}
              >
                <Icon className="h-3.5 w-3.5" /> {c.label}
              </button>
            );
          })}
        </div>

        <label htmlFor="admin-send-to" style={{ ...th, border: "none", padding: 0, display: "block", marginBottom: 6 }}>
          {channel === "email" ? "Email address" : "WhatsApp number"}
        </label>
        <input
          id="admin-send-to" autoFocus
          type={channel === "email" ? "email" : "tel"}
          value={to}
          onChange={(e) => { setTo(e.target.value); setError(""); }}
          placeholder={channel === "email" ? "friend@example.com" : "9876543210"}
          style={{
            width: "100%", borderRadius: 8, border: "1px solid rgba(245,235,221,0.15)",
            background: "rgba(245,235,221,0.05)", color: COLORS.cream,
            padding: "9px 12px", fontSize: 13, outline: "none",
          }}
        />
        {error && <p className="mt-2 text-[11px] font-medium" style={{ color: "#f87171" }}>{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose}
                  style={{ ...btn, background: "transparent", color: "rgba(245,235,221,0.6)", border: "1px solid rgba(245,235,221,0.2)" }}>
            Cancel
          </button>
          <button type="submit" disabled={busy || !to.trim()}
                  className="flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ ...btn, background: COLORS.gold, color: "#0a0104", border: "none" }}>
            <Send className="h-3.5 w-3.5" /> {busy ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AdminReferralsPage() {
  const [data, setData] = useState(null);
  const [codes, setCodes] = useState([]);
  const [invites, setInvites] = useState([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [sendFor, setSendFor] = useState(null);

  // Everything on this page moves together: cancelling a code changes
  // the code list AND the summary, sending an invite changes the invite
  // list AND the code's "invites sent" count. Reloading all three keeps
  // what is on screen honest without tracking which bits went stale.
  const reload = (status) => {
    setError("");
    return Promise.all([
      fetchAdminReferrals({ status: status || undefined, limit: 200 }),
      fetchAdminReferralCodes({ onlyLive: true }).catch(() => []),
      fetchAdminReferralInvites().catch(() => []),
    ]).then(([report, codeList, inviteList]) => {
      setData(report);
      setCodes(codeList);
      setInvites(inviteList);
    });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    reload(filter)
      .catch((err) => { if (!cancelled) setError(err.message || "Couldn't load referrals."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const act = async (id, fn, message) => {
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      await fn();
      await reload(filter);
      setNotice(message);
    } catch (err) {
      setError(err.message || "That didn't work.");
    } finally {
      setBusyId("");
    }
  };

  const s = data?.summary;

  return (
    <div>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold" style={{ color: COLORS.cream }}>
        <Share2 className="h-6 w-6" style={{ color: COLORS.gold }} /> Referrals
      </h1>
      <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
        Who referred whom, and what it has paid out. Set the point values in Admin &gt; Reward Points.
      </p>

      {sendFor && (
        <SendDialog
          code={sendFor}
          onClose={() => setSendFor(null)}
          onSent={(message) => {
            setSendFor(null);
            setNotice(message);
            reload(filter).catch(() => {});
          }}
        />
      )}

      {error && <p className="mb-4 text-sm" style={{ color: "#f87171" }}>{error}</p>}
      {loading && !data && <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading…</p>}

      {s && (
        <>
          <div className="mb-6 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
            <Stat label="Codes handed out" value={s.codes_issued} hint={`${s.codes_active} still valid`} />
            <Stat label="Expired unused" value={s.codes_expired} hint="Nobody signed up with them" />
            <Stat label="Signed up" value={s.signed_up} hint="Used someone's code" />
            <Stat label="Waiting to subscribe" value={s.awaiting_subscription} hint="Nothing paid out yet" accent="#E0A458" />
            <Stat label="Rewarded" value={s.rewarded} hint="Both sides credited" accent={COLORS.green} />
            <Stat label="Cancelled" value={s.cancelled ?? 0} hint="Stopped by an admin" accent="#f87171" />
            <Stat label="Points paid out" value={s.points_paid_out} hint="Across both sides" accent={COLORS.gold} />
          </div>

          {notice && <p className="mb-3 text-xs font-medium" style={{ color: COLORS.green }}>{notice}</p>}

          <div className="mb-3 flex flex-wrap gap-2">
            {[
              { v: "", label: `All (${s.signed_up})` },
              { v: "registered", label: `Waiting (${s.awaiting_subscription})` },
              { v: "rewarded", label: `Rewarded (${s.rewarded})` },
              { v: "cancelled", label: `Cancelled (${s.cancelled ?? 0})` },
            ].map((t) => (
              <button
                key={t.v} type="button" onClick={() => setFilter(t.v)}
                className="rounded-full px-4 py-1.5 text-xs font-semibold"
                style={filter === t.v
                  ? { background: COLORS.gold, color: "#0a0104" }
                  : { background: "rgba(245,235,221,0.06)", color: "rgba(245,235,221,0.7)", border: "1px solid rgba(245,235,221,0.12)" }}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ ...card, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={th}>Referrer</th>
                  <th style={th}>New customer</th>
                  <th style={th}>Code</th>
                  <th style={th}>Status</th>
                  <th style={th}>Signed up</th>
                  <th style={th}>Subscribed</th>
                  <th style={{ ...th, textAlign: "right" }}>Points</th>
                  <th style={{ ...th, textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.referrals.length === 0 && (
                  <tr>
                    <td style={{ ...td, color: "rgba(245,235,221,0.5)" }} colSpan={8}>
                      {filter ? "Nothing in this group yet." : "No one has used a referral code yet."}
                    </td>
                  </tr>
                )}
                {data.referrals.map((r) => {
                  const st = STATUS[r.status] || { label: r.status, color: COLORS.cream, hint: "" };
                  return (
                    <tr key={r.id}>
                      <td style={td}>
                        {r.referrer_name}
                        <div className="text-[11px]" style={{ color: "rgba(245,235,221,0.45)" }}>{r.referrer_email}</div>
                      </td>
                      <td style={td}>
                        {r.referred_name}
                        <div className="text-[11px]" style={{ color: "rgba(245,235,221,0.45)" }}>{r.referred_email}</div>
                      </td>
                      <td style={{ ...td, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{r.code}</td>
                      <td style={td}>
                        <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                              style={{ background: `${st.color}22`, color: st.color }}>
                          {st.label}
                        </span>
                        <div className="mt-1 text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>{st.hint}</div>
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(r.registered_at)}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(r.subscribed_at)}</td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                        {r.status === "rewarded"
                          ? <>
                              {r.referrer_points_awarded} + {r.referred_points_awarded}
                              <div className="text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>referrer + new</div>
                            </>
                          : <span style={{ color: "rgba(245,235,221,0.4)" }}>—</span>}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        {r.status === "registered" ? (
                          <button
                            type="button" style={ghostBtn} disabled={busyId === r.id}
                            onClick={() => act(r.id, () => cancelAdminReferral(r.id),
                                               `Referral for ${r.referred_email} cancelled.`)}
                          >
                            {busyId === r.id ? "…" : "Cancel"}
                          </button>
                        ) : (
                          <span style={{ color: "rgba(245,235,221,0.3)", fontSize: 11 }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {data.total > data.referrals.length && (
            <p className="mt-2 text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>
              Showing the {data.referrals.length} most recent of {data.total}.
            </p>
          )}

          {/* ------------------------------------------- live codes */}
          <h2 className="mb-1 mt-8 text-lg font-semibold" style={{ color: COLORS.cream }}>Live codes</h2>
          <p className="mb-3 text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>
            Codes that still work. Send one on behalf of its owner, or cancel it so nobody can use it
            again — cancelling never takes points away from someone who already signed up with it.
          </p>
          <div style={{ ...card, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
              <thead>
                <tr>
                  <th style={th}>Code</th>
                  <th style={th}>Belongs to</th>
                  <th style={{ ...th, textAlign: "right" }}>Invites sent</th>
                  <th style={{ ...th, textAlign: "right" }}>Sign-ups</th>
                  <th style={th}>Good until</th>
                  <th style={{ ...th, textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {codes.length === 0 && (
                  <tr><td style={{ ...td, color: "rgba(245,235,221,0.5)" }} colSpan={6}>
                    No live codes. One is created the first time a customer opens Refer &amp; Earn.
                  </td></tr>
                )}
                {codes.map((c) => (
                  <tr key={c.id}>
                    <td style={{ ...td, fontFamily: "ui-monospace, monospace", fontSize: 12, color: COLORS.gold }}>{c.code}</td>
                    <td style={td}>
                      {c.owner_name}
                      <div className="text-[11px]" style={{ color: "rgba(245,235,221,0.45)" }}>{c.owner_email}</div>
                    </td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{c.invites_sent}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{c.signups}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(c.expires_at)}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          style={{ ...btn, background: COLORS.gold, color: "#0a0104", border: "none" }}
                          onClick={() => { setNotice(""); setSendFor(c); }}
                        >
                          Send
                        </button>
                        <button
                          type="button" style={ghostBtn} disabled={busyId === c.id}
                          onClick={() => act(c.id, () => cancelAdminReferralCode(c.id),
                                             `Code ${c.code} cancelled.`)}
                        >
                          {busyId === c.id ? "…" : "Cancel"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ---------------------------------------- invites sent */}
          {invites.length > 0 && (
            <>
              <h2 className="mb-1 mt-8 text-lg font-semibold" style={{ color: COLORS.cream }}>Invites sent</h2>
              <p className="mb-3 text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>
                The 100 most recent, whether sent by a customer or from this page.
              </p>
              <div style={{ ...card, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
                  <thead>
                    <tr>
                      <th style={th}>Sent to</th>
                      <th style={th}>How</th>
                      <th style={th}>Code</th>
                      <th style={th}>From</th>
                      <th style={th}>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((i) => (
                      <tr key={i.id}>
                        <td style={td}>
                          {i.destination}
                          {i.status === "failed" && (
                            <div className="text-[11px]" style={{ color: "#f87171" }}>Didn't go through</div>
                          )}
                        </td>
                        <td style={td}>
                          <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "rgba(245,235,221,0.7)" }}>
                            {i.channel === "email"
                              ? <><Mail className="h-3.5 w-3.5" /> Email</>
                              : <><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</>}
                          </span>
                        </td>
                        <td style={{ ...td, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{i.code}</td>
                        <td style={td}>{i.sent_by}</td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>{fmtDate(i.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Where each person's points actually came from — the ledger
              separates referral points from points earned by buying. */}
          <h2 className="mb-1 mt-8 text-lg font-semibold" style={{ color: COLORS.cream }}>Where points came from</h2>
          <p className="mb-3 text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>
            Counted from November 2026, when point movements started being recorded line by line. A
            balance earned before that shows here as a balance with nothing behind it.
          </p>
          <div style={{ ...card, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={th}>Customer</th>
                  {/* Two columns, not one: a newly referred customer has
                      referral points without having referred anybody, and
                      a single "by referring" column said the opposite of
                      what happened to them. */}
                  <th style={{ ...th, textAlign: "right" }}>Referred others</th>
                  <th style={{ ...th, textAlign: "right" }}>Was referred</th>
                  <th style={{ ...th, textAlign: "right" }}>By buying</th>
                  <th style={{ ...th, textAlign: "right" }}>Spent</th>
                  <th style={{ ...th, textAlign: "right" }}>Balance now</th>
                </tr>
              </thead>
              <tbody>
                {data.top_earners.length === 0 && (
                  <tr><td style={{ ...td, color: "rgba(245,235,221,0.5)" }} colSpan={6}>No point movements recorded yet.</td></tr>
                )}
                {data.top_earners.map((e) => (
                  <tr key={e.user_id}>
                    <td style={td}>
                      {e.name}
                      <div className="text-[11px]" style={{ color: "rgba(245,235,221,0.45)" }}>{e.email}</div>
                    </td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: e.referred_others_points ? COLORS.green : "rgba(245,235,221,0.4)" }}>{e.referred_others_points}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: e.was_referred_points ? COLORS.green : "rgba(245,235,221,0.4)" }}>{e.was_referred_points}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{e.purchase_points}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "rgba(245,235,221,0.6)" }}>{e.spent_points}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: COLORS.gold }}>{e.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
