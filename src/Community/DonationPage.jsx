import React, { useEffect, useState } from "react";
import { ArrowLeft, HandCoins, CheckCircle2 } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { useApp } from "../context/AppContext";
import { fetchOrganisers, createDonationOrder, verifyDonationPayment, fetchMyDonationRegistrationStatus, deactivateMyDonationRegistration, deleteMyDonationRegistration } from "../api";
import DonationRegistrationModal from "./DonationRegistrationModal";
import ConfirmDialog from "../shared/ConfirmDialog";

// ---------------------------------------------------------------------------
// Donation — the directory lists Plays Organisers who both hold that
// role AND have an admin-approved DonationRegistration (via GET
// /api/organisers) — role alone used to be enough, but payout details
// now need admin review first. Donating opens a real Razorpay checkout
// (test mode), same signature-verification pattern as subscription
// checkout.
// ---------------------------------------------------------------------------

export default function DonationPage({ onBack }) {
  const { isLoggedIn, requestLogin, profile } = useApp();
  const [organisers, setOrganisers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [confirmed, setConfirmed] = useState(null);

  const [showRegisterLink, setShowRegisterLink] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registrationSubmitted, setRegistrationSubmitted] = useState(false);
  const [myRegistration, setMyRegistration] = useState(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [registrationActionBusy, setRegistrationActionBusy] = useState(false);
  const [registrationActionError, setRegistrationActionError] = useState("");

  const loadMyRegistrationStatus = () => {
    if (!isLoggedIn || !profile || profile.role !== "plays_organiser") {
      setShowRegisterLink(false);
      setMyRegistration(null);
      return;
    }
    fetchMyDonationRegistrationStatus()
      .then((res) => {
        setShowRegisterLink(!res.has_pending_or_approved);
        setMyRegistration(res.latest_status ? res : null);
      })
      .catch(() => { setShowRegisterLink(false); setMyRegistration(null); });
  };

  useEffect(() => { loadMyRegistrationStatus(); }, [isLoggedIn, profile?.role]);


  useEffect(() => {
    fetchOrganisers()
      .then(setOrganisers)
      .catch(() => setOrganisers([]))
      .finally(() => setLoading(false));
  }, []);

  // Razorpay's checkout widget, loaded once lazily.
  useEffect(() => {
    if (document.getElementById("razorpay-checkout-js")) return;
    const script = document.createElement("script");
    script.id = "razorpay-checkout-js";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const handleSelect = (organiser) => {
    if (!isLoggedIn) {
      requestLogin();
      return;
    }
    setSelected(organiser);
    setConfirmed(null);
  };

  const handleDeactivateRegistration = async () => {
    setRegistrationActionBusy(true);
    setRegistrationActionError("");
    try {
      await deactivateMyDonationRegistration();
      loadMyRegistrationStatus();
    } catch (err) {
      setRegistrationActionError(err.message || "Couldn't deactivate your registration.");
    } finally {
      setRegistrationActionBusy(false);
      setConfirmDeactivate(false);
    }
  };

  const handleDeleteRegistration = async () => {
    setRegistrationActionBusy(true);
    setRegistrationActionError("");
    try {
      await deleteMyDonationRegistration();
      loadMyRegistrationStatus();
    } catch (err) {
      setRegistrationActionError(err.message || "Couldn't delete your registration.");
    } finally {
      setRegistrationActionBusy(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className="mx-auto max-w-3xl px-6 pb-16 pt-24 sm:px-10 sm:pt-28">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
          style={{ color: COLORS.gold }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <h1 className="mb-1 text-3xl font-semibold" style={{ color: COLORS.cream }}>Support a Plays Organiser</h1>
        <p className="mb-2 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
          Donate directly to registered organisers on theomy.
        </p>
        {showRegisterLink && (
          <button
            type="button"
            onClick={() => setShowRegisterModal(true)}
            className="mb-4 text-sm font-medium hover:opacity-80"
            style={{ color: COLORS.gold }}
          >
            Register for Donation →
          </button>
        )}

        {myRegistration && (
          <div className="mb-8 rounded-xl p-4" style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.2)" }}>
            <p className="text-sm font-medium" style={{ color: COLORS.cream }}>
              {myRegistration.latest_status === "pending" && "Your donation registration is pending review."}
              {myRegistration.latest_status === "approved" && "Your donation registration is approved — you're listed above for supporters to donate to."}
              {myRegistration.latest_status === "rejected" && "Your last donation registration was rejected."}
              {myRegistration.latest_status === "disabled" && "Your donation registration is currently deactivated."}
            </p>
            {myRegistration.latest_status === "rejected" && myRegistration.rejection_reason && (
              <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Reason: {myRegistration.rejection_reason}</p>
            )}
            {registrationActionError && (
              <p className="mt-2 text-xs font-medium" style={{ color: "#f87171" }}>{registrationActionError}</p>
            )}
            {myRegistration.latest_status === "approved" && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeactivate(true)}
                  className="rounded-full px-4 py-1.5 text-xs font-medium"
                  style={{ border: "1px solid rgba(245,235,221,0.2)", color: "rgba(245,235,221,0.7)" }}
                >
                  Deactivate
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-full px-4 py-1.5 text-xs font-medium"
                  style={{ border: "1px solid rgba(248,113,113,0.4)", color: "#f87171" }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
        {!showRegisterLink && !myRegistration && <div className="mb-8" />}

        {registrationSubmitted && (
          <div className="mb-6 flex items-center gap-2 rounded-xl p-4" style={{ background: "rgba(111,207,151,0.1)", border: "1px solid rgba(111,207,151,0.35)" }}>
            <CheckCircle2 className="h-5 w-5" style={{ color: "#6FCF97" }} />
            <p className="text-sm" style={{ color: "#6FCF97" }}>Registration submitted — we'll review it and get back to you.</p>
          </div>
        )}

        {confirmed && (
          <div className="mb-6 flex items-center gap-2 rounded-xl p-4" style={{ background: "rgba(111,207,151,0.1)", border: "1px solid rgba(111,207,151,0.35)" }}>
            <CheckCircle2 className="h-5 w-5" style={{ color: "#6FCF97" }} />
            <p className="text-sm" style={{ color: "#6FCF97" }}>Thank you — your ₹{confirmed} donation was successful.</p>
          </div>
        )}

        {loading ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>Loading organisers…</p>
        ) : organisers.length === 0 ? (
          <p className="text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>No organisers have registered yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {organisers.map((org) => (
              <div key={org.id} className="flex items-start gap-4 rounded-2xl p-5" style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.15)" }}>
                <div
                  className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border text-base font-semibold"
                  style={{ borderColor: "rgba(212,175,55,0.4)", color: COLORS.cream }}
                >
                  {org.profile_photo_url ? (
                    <img src={org.profile_photo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    org.name[0]?.toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold" style={{ color: COLORS.cream }}>{org.name}</p>
                  <p className="mt-0.5 text-xs" style={{ color: COLORS.gold }}>Plays Organiser</p>
                  <button
                    type="button"
                    onClick={() => handleSelect(org)}
                    className="mt-3 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold"
                    style={{ border: `1px solid ${COLORS.gold}`, color: COLORS.gold }}
                  >
                    <HandCoins className="h-3.5 w-3.5" /> Donate
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {selected && (
        <DonateModal
          organiser={selected}
          userEmail={profile.email}
          userPhone={profile.phone}
          onClose={() => setSelected(null)}
          onSuccess={(amount) => {
            setSelected(null);
            setConfirmed(amount);
          }}
        />
      )}

      {showRegisterModal && (
        <DonationRegistrationModal
          onClose={() => setShowRegisterModal(false)}
          onSubmitted={() => {
            setShowRegisterModal(false);
            setShowRegisterLink(false);
            setRegistrationSubmitted(true);
            loadMyRegistrationStatus();
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDeactivate}
        title="Deactivate registration"
        message="Deactivate your donation registration? Supporters won't be able to donate to you until you register again."
        confirmLabel="Deactivate"
        danger
        busy={registrationActionBusy}
        onCancel={() => setConfirmDeactivate(false)}
        onConfirm={handleDeactivateRegistration}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete registration"
        message="Permanently delete your donation registration? This can't be undone — you'll need to submit a new registration and wait for approval again."
        confirmLabel="Delete"
        danger
        busy={registrationActionBusy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={handleDeleteRegistration}
      />
    </div>
  );
}

function DonateModal({ organiser, userEmail, userPhone, onClose, onSuccess }) {
  const [amount, setAmount] = useState("500");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  const handleDonate = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return;

    setError("");
    setPaying(true);
    try {
      const order = await createDonationOrder({ organiserUserId: organiser.id, amount: amt });

      if (!window.Razorpay) {
        throw new Error("Payment widget failed to load. Please refresh and try again.");
      }

      const rzp = new window.Razorpay({
        key: order.razorpay_key_id,
        amount: Math.round(Number(order.amount) * 100),
        currency: order.currency,
        name: "theomy",
        description: `Donation to ${order.organiser_name}`,
        order_id: order.razorpay_order_id,
        prefill: { email: userEmail, contact: userPhone || undefined },
        theme: { color: "#D4AF37" },
        handler: async (response) => {
          try {
            await verifyDonationPayment({
              donationId: order.donation_id,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            onSuccess(Number(order.amount));
          } catch (err) {
            setError(err.message || "Payment verification failed. If money was deducted, contact support.");
          } finally {
            setPaying(false);
          }
        },
        modal: { ondismiss: () => setPaying(false) },
      });
      rzp.on("payment.failed", () => {
        setError("Payment failed. Please try again.");
        setPaying(false);
      });
      rzp.open();
    } catch (err) {
      setError(err.message || "Couldn't start checkout. Please try again.");
      setPaying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={paying ? undefined : onClose}>
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: COLORS.blackSoft, border: `1px solid rgba(212,175,55,0.2)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold" style={{ color: COLORS.cream }}>Donate to {organiser.name}</h2>
        <p className="mb-4 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>Plays Organiser</p>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Amount (₹)</label>
        <input
          type="number"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-lg border px-4 py-2.5 text-sm outline-none"
          style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
        />
        {error && (
          <p className="mt-3 text-xs font-medium" style={{ color: "#f87171" }}>{error}</p>
        )}
        <div className="mt-4 flex items-center justify-between">
          <button onClick={onClose} disabled={paying} className="text-xs hover:opacity-80" style={{ color: "rgba(245,235,221,0.5)" }}>Cancel</button>
          <button
            onClick={handleDonate}
            disabled={!Number(amount) || Number(amount) <= 0 || paying}
            className="rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
          >
            {paying ? "Processing…" : `Donate ₹${amount || 0}`}
          </button>
        </div>
      </div>
    </div>
  );
}
