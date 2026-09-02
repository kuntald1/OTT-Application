import React, { useEffect, useState } from "react";
import { CheckCircle2, ArrowLeft, Users, Plus, UserX, Lock } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { useApp } from "../context/AppContext";
import { fetchMySubAccounts, fetchMyParent, createSubAccount, deactivateSubAccount, changePassword } from "../api";
import ConfirmDialog from "../shared/ConfirmDialog";

// ---------------------------------------------------------------------------
// Manage Profile — reached from the profile menu. Edits photo, name, email,
// and phone — all saved to the real backend via AppContext's
// changePhoto()/updateProfile(). Photo is uploaded and stored on the
// server, so it persists across refresh, logout, and other devices.
// ---------------------------------------------------------------------------

export default function ManageProfilePage({ onBack }) {
  const { profile, changePhoto, updateProfile } = useApp();
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const handleChangePassword = async () => {
    setPasswordError("");
    setPasswordSaved(false);
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirm password don't match.");
      return;
    }
    setChangingPassword(true);
    try {
      await changePassword({ oldPassword, newPassword });
      setOldPassword(""); setNewPassword(""); setConfirmPassword("");
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 4000);
    } catch (err) {
      setPasswordError(err.message || "Couldn't change password. Please try again.");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSave = async () => {
    setError("");
    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), email: email.trim(), phone: phone.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message || "Couldn't save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoChange = async (file) => {
    if (!file) return;
    setPhotoError("");
    setUploadingPhoto(true);
    try {
      await changePhoto(file);
    } catch (err) {
      setPhotoError(err.message || "Couldn't upload photo. Please try again.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  // --- Family Accounts (sub-account sharing this user's subscription screens) ---
  const [myParent, setMyParent] = useState(null);
  const [subAccountsInfo, setSubAccountsInfo] = useState(null);
  const [showCreateSubForm, setShowCreateSubForm] = useState(false);
  const [subName, setSubName] = useState("");
  const [subEmail, setSubEmail] = useState("");
  const [subPassword, setSubPassword] = useState("");
  const [creatingSub, setCreatingSub] = useState(false);
  const [subError, setSubError] = useState("");
  const [confirmDeactivateSub, setConfirmDeactivateSub] = useState(null);
  const [deactivatingSubId, setDeactivatingSubId] = useState(null);

  const loadFamilyInfo = () => {
    fetchMyParent()
      .then((res) => {
        setMyParent(res);
        if (!res.has_parent) {
          fetchMySubAccounts().then(setSubAccountsInfo).catch(() => setSubAccountsInfo(null));
        }
      })
      .catch(() => setMyParent(null));
  };

  useEffect(() => { loadFamilyInfo(); }, []);

  const handleCreateSubAccount = async () => {
    if (!subName.trim() || !subEmail.trim() || subPassword.length < 8) return;
    setSubError("");
    setCreatingSub(true);
    try {
      await createSubAccount({ name: subName.trim(), email: subEmail.trim(), password: subPassword });
      setSubName(""); setSubEmail(""); setSubPassword("");
      setShowCreateSubForm(false);
      loadFamilyInfo();
    } catch (err) {
      setSubError(err.message || "Couldn't create the account. Please try again.");
    } finally {
      setCreatingSub(false);
    }
  };

  const handleDeactivateSubConfirmed = async () => {
    setDeactivatingSubId(confirmDeactivateSub.id);
    try {
      await deactivateSubAccount(confirmDeactivateSub.id);
      loadFamilyInfo();
    } catch (err) {
      // best-effort UI; loadFamilyInfo() reflects the real state either way
    } finally {
      setDeactivatingSubId(null);
      setConfirmDeactivateSub(null);
    }
  };

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

  return (
    <div style={{ background: COLORS.black, fontFamily: "'Geist', -apple-system, sans-serif", minHeight: "100vh" }}>
      <main className="mx-auto max-w-xl px-6 pb-16 pt-24 sm:px-10 sm:pt-28">
        <button
          type="button"
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
          style={{ color: COLORS.gold }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="mb-1 text-3xl font-semibold" style={{ color: COLORS.cream }}>Manage Profile</h1>

        <div className="mb-8" />
        <div className="rounded-2xl p-6" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="mb-2 flex items-center gap-4">
            <div
              className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border text-lg font-semibold"
              style={{ borderColor: "rgba(212,175,55,0.4)", color: COLORS.cream }}
            >
              {profile.photo ? (
                <img src={profile.photo} alt="" className="h-full w-full object-cover" />
              ) : (
                (profile.name || "?")[0]?.toUpperCase()
              )}
            </div>
            <label
              className="cursor-pointer rounded-full px-4 py-2 text-sm font-medium"
              style={{
                border: `1px solid ${COLORS.gold}`,
                color: COLORS.gold,
                opacity: uploadingPhoto ? 0.5 : 1,
                pointerEvents: uploadingPhoto ? "none" : "auto",
              }}
            >
              {uploadingPhoto ? "Uploading…" : "Change photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingPhoto}
                onChange={(e) => handlePhotoChange(e.target.files?.[0])}
              />
            </label>
          </div>
          {photoError && (
            <p className="mb-4 text-xs font-medium" style={{ color: "#f87171" }}>{photoError}</p>
          )}

          <div className="mb-4 mt-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </div>
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Email</label>
            <input
              type="email"
              value={email}
              readOnly
              className="cursor-not-allowed"
              style={{ ...inputStyle, opacity: 0.6 }}
            />
          </div>
          <div className="mb-6">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Phone (optional)</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Add a phone number" style={inputStyle} />
          </div>

          {error && (
            <div className="mb-4 rounded-lg px-3 py-2 text-sm font-medium" style={{ background: "rgba(255,255,255,0.95)", color: "#b91c1c", border: "1px solid rgba(185,28,28,0.3)" }}>{error}</div>
          )}

          <div className="flex items-center gap-4">
            <button
              type="button"
              disabled={!name.trim() || !email.trim() || saving}
              onClick={handleSave}
              className="rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm" style={{ color: "#6FCF97" }}>
                <CheckCircle2 className="h-4 w-4" /> Saved
              </span>
            )}
          </div>
        </div>

        <div className="mb-8" />
        <div className="rounded-2xl p-6" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}>
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold" style={{ color: COLORS.cream }}>
            <Lock className="h-4 w-4" style={{ color: COLORS.gold }} /> Change Password
          </h2>

          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Old Password</label>
            <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} style={inputStyle} />
          </div>
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>New Password</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min. 8 characters" style={inputStyle} />
          </div>
          <div className="mb-6">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(245,235,221,0.5)" }}>Confirm Password</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={inputStyle} />
          </div>

          {passwordError && (
            <div className="mb-4 rounded-lg px-3 py-2 text-sm font-medium" style={{ background: "rgba(255,255,255,0.95)", color: "#b91c1c", border: "1px solid rgba(185,28,28,0.3)" }}>{passwordError}</div>
          )}

          <div className="flex items-center gap-4">
            <button
              type="button"
              disabled={!oldPassword || !newPassword || !confirmPassword || changingPassword}
              onClick={handleChangePassword}
              className="rounded-full px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            >
              {changingPassword ? "Changing…" : "Change Password"}
            </button>
            {passwordSaved && (
              <span className="flex items-center gap-1.5 text-sm" style={{ color: "#6FCF97" }}>
                <CheckCircle2 className="h-4 w-4" /> Password changed
              </span>
            )}
          </div>
        </div>

        {myParent?.has_parent && (
          <div className="mt-6 rounded-2xl p-6" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}>
            <h2 className="mb-1 flex items-center gap-2 text-base font-semibold" style={{ color: COLORS.cream }}>
              <Users className="h-4 w-4" style={{ color: COLORS.gold }} /> Managed Account
            </h2>
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
              This account is managed by <span style={{ color: COLORS.cream }}>{myParent.parent_name}</span> ({myParent.parent_email}).
            </p>
          </div>
        )}

        {!myParent?.has_parent && subAccountsInfo && (subAccountsInfo.max_allowed > 0 || subAccountsInfo.sub_accounts.length > 0) && (
          <div className="mt-6 rounded-2xl p-6" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}>
            <h2 className="mb-1 flex items-center gap-2 text-base font-semibold" style={{ color: COLORS.cream }}>
              <Users className="h-4 w-4" style={{ color: COLORS.gold }} /> Family Accounts
            </h2>
            <p className="mb-4 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
              {subAccountsInfo.sub_accounts.filter((s) => s.is_active).length} of {subAccountsInfo.max_allowed} additional account{subAccountsInfo.max_allowed === 1 ? "" : "s"} created — shares your plan's extra screens.
            </p>

            {subAccountsInfo.sub_accounts.length > 0 && (
              <div className="mb-4 flex flex-col gap-2">
                {subAccountsInfo.sub_accounts.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: "rgba(245,235,221,0.03)", opacity: s.is_active ? 1 : 0.5 }}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" style={{ color: COLORS.cream }}>
                        {s.name} {!s.is_active && <span className="ml-1 text-[10px] font-semibold uppercase" style={{ color: "#f87171" }}>Deactivated</span>}
                      </p>
                      <p className="truncate text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{s.email}</p>
                    </div>
                    {s.is_active && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeactivateSub(s)}
                        disabled={deactivatingSubId === s.id}
                        className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                        style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}
                      >
                        <UserX className="h-3.5 w-3.5" /> Deactivate
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {subAccountsInfo.sub_accounts.filter((s) => s.is_active).length < subAccountsInfo.max_allowed && (
              showCreateSubForm ? (
                <div className="rounded-lg p-4" style={{ background: "rgba(245,235,221,0.03)", border: "1px solid rgba(212,175,55,0.2)" }}>
                  <div className="mb-3">
                    <input type="text" placeholder="Name" value={subName} onChange={(e) => setSubName(e.target.value)} style={inputStyle} className="mb-2" />
                    <input type="email" placeholder="Email" value={subEmail} onChange={(e) => setSubEmail(e.target.value)} style={inputStyle} className="mb-2" />
                    <input type="password" placeholder="Password (min. 8 characters)" value={subPassword} onChange={(e) => setSubPassword(e.target.value)} style={inputStyle} />
                  </div>
                  {subError && <p className="mb-3 text-xs font-medium" style={{ color: "#f87171" }}>{subError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCreateSubAccount}
                      disabled={creatingSub || !subName.trim() || !subEmail.trim() || subPassword.length < 8}
                      className="rounded-full px-5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ background: COLORS.gold, color: "#0a0104" }}
                    >
                      {creatingSub ? "Creating…" : "Create"}
                    </button>
                    <button type="button" onClick={() => { setShowCreateSubForm(false); setSubError(""); }} className="rounded-full px-4 py-2 text-xs font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCreateSubForm(true)}
                  className="flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
                  style={{ color: COLORS.gold }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add account
                </button>
              )
            )}
          </div>
        )}
      </main>

      <ConfirmDialog
        open={!!confirmDeactivateSub}
        title="Deactivate account"
        message={`Deactivate ${confirmDeactivateSub?.name}'s account? They won't be able to log in anymore, but this frees up a slot to add someone else.`}
        confirmLabel="Deactivate"
        danger
        busy={deactivatingSubId === confirmDeactivateSub?.id}
        onCancel={() => setConfirmDeactivateSub(null)}
        onConfirm={handleDeactivateSubConfirmed}
      />
    </div>
  );
}
