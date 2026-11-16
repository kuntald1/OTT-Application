import React, { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { fetchAdminReferrals } from "./adminApi";

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

export default function AdminReferralsPage() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchAdminReferrals({ status: filter || undefined, limit: 200 })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err.message || "Couldn't load referrals."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filter]);

  const s = data?.summary;

  return (
    <div>
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold" style={{ color: COLORS.cream }}>
        <Share2 className="h-6 w-6" style={{ color: COLORS.gold }} /> Referrals
      </h1>
      <p className="mb-6 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
        Who referred whom, and what it has paid out. Set the point values in Admin &gt; Reward Points.
      </p>

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
            <Stat label="Points paid out" value={s.points_paid_out} hint="Across both sides" accent={COLORS.gold} />
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            {[
              { v: "", label: `All (${s.signed_up})` },
              { v: "registered", label: `Waiting (${s.awaiting_subscription})` },
              { v: "rewarded", label: `Rewarded (${s.rewarded})` },
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
                </tr>
              </thead>
              <tbody>
                {data.referrals.length === 0 && (
                  <tr>
                    <td style={{ ...td, color: "rgba(245,235,221,0.5)" }} colSpan={7}>
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

          {/* Where each person's points actually came from — the ledger
              separates referral points from points earned by buying. */}
          <h2 className="mb-1 mt-8 text-lg font-semibold" style={{ color: COLORS.cream }}>Where points came from</h2>
          <p className="mb-3 text-[11px]" style={{ color: "rgba(245,235,221,0.4)" }}>
            Counted from November 2026, when point movements started being recorded line by line. A
            balance earned before that shows here as a balance with nothing behind it.
          </p>
          <div style={{ ...card, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
              <thead>
                <tr>
                  <th style={th}>Customer</th>
                  <th style={{ ...th, textAlign: "right" }}>By referring</th>
                  <th style={{ ...th, textAlign: "right" }}>By buying</th>
                  <th style={{ ...th, textAlign: "right" }}>Spent</th>
                  <th style={{ ...th, textAlign: "right" }}>Balance now</th>
                </tr>
              </thead>
              <tbody>
                {data.top_earners.length === 0 && (
                  <tr><td style={{ ...td, color: "rgba(245,235,221,0.5)" }} colSpan={5}>No point movements recorded yet.</td></tr>
                )}
                {data.top_earners.map((e) => (
                  <tr key={e.user_id}>
                    <td style={td}>
                      {e.name}
                      <div className="text-[11px]" style={{ color: "rgba(245,235,221,0.45)" }}>{e.email}</div>
                    </td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: e.referral_points ? COLORS.green : "rgba(245,235,221,0.4)" }}>{e.referral_points}</td>
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
