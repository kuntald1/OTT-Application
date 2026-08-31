import React, { useState } from "react";
import { X, Upload } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { submitDonationRegistration } from "../api";

const inputStyle = {
  width: "100%", borderRadius: 8, border: "1px solid rgba(245,235,221,0.15)",
  background: "rgba(245,235,221,0.05)", color: COLORS.cream, padding: "10px 12px", fontSize: 14, outline: "none",
};
const labelStyle = {
  marginBottom: 4, display: "block", fontSize: 11, fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.03em", color: "rgba(245,235,221,0.5)",
};

export default function DonationRegistrationModal({ onClose, onSubmitted }) {
  const [groupName, setGroupName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [qrCodeFile, setQrCodeFile] = useState(null);
  const [documentFile, setDocumentFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const hasBankDetails = accountNumber.trim() && ifscCode.trim();
  const hasQr = !!qrCodeFile;

  const handleSubmit = async () => {
    if (!groupName.trim()) {
      setError("Group name is required.");
      return;
    }
    if (!hasBankDetails && !hasQr) {
      setError("Provide either bank details (account number + IFSC) or a QR code.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await submitDonationRegistration({
        groupName: groupName.trim(), accountNumber: accountNumber.trim(), ifscCode: ifscCode.trim(),
        qrCodeFile, documentFile,
      });
      onSubmitted?.();
    } catch (err) {
      setError(err.message || "Couldn't submit your registration. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div
        className="w-full max-w-md overflow-y-auto rounded-2xl p-6"
        style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.25)", maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: COLORS.cream }}>Register for Donation</h2>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/5" style={{ color: "rgba(245,235,221,0.6)" }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,0.95)", color: "#b91c1c", border: "1px solid rgba(185,28,28,0.3)" }}>
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <div>
            <label style={labelStyle}>Group Name *</label>
            <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} style={inputStyle} />
          </div>

          <p className="text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
            Provide either bank details <em>or</em> a QR code — whichever supporters should use to reach you.
          </p>

          <div>
            <label style={labelStyle}>Account Number</label>
            <input type="text" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>IFSC Code</label>
            <input type="text" value={ifscCode} onChange={(e) => setIfscCode(e.target.value)} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Or Upload QR Code</label>
            <label
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm hover:opacity-80"
              style={{ borderColor: "rgba(245,235,221,0.15)", color: qrCodeFile ? COLORS.cream : "rgba(245,235,221,0.5)" }}
            >
              <Upload className="h-4 w-4 flex-shrink-0" />
              {qrCodeFile ? qrCodeFile.name : "Choose image…"}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setQrCodeFile(e.target.files?.[0] || null)} />
            </label>
          </div>

          <div>
            <label style={labelStyle}>Upload Document</label>
            <label
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm hover:opacity-80"
              style={{ borderColor: "rgba(245,235,221,0.15)", color: documentFile ? COLORS.cream : "rgba(245,235,221,0.5)" }}
            >
              <Upload className="h-4 w-4 flex-shrink-0" />
              {documentFile ? documentFile.name : "Choose file (PDF or image, optional)…"}
              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setDocumentFile(e.target.files?.[0] || null)} />
            </label>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-5 w-full rounded-full py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
        >
          {submitting ? "Submitting…" : "Submit Registration"}
        </button>
      </div>
    </div>
  );
}
