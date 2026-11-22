import React, { useEffect, useState } from "react";
import { CheckCircle2, ArrowLeft, Users, Plus, UserX, Lock, BookOpen, ImagePlus, RefreshCw } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR } from "../theme";
import { useApp } from "../context/AppContext";
import { fetchMySubAccounts, fetchMyParent, createSubAccount, deactivateSubAccount, setSubAccountMinor, changePassword, fetchMyOrganiserSections, createMyOrganiserSection, updateMyOrganiserSection, deleteMyOrganiserSection, uploadMyStudioCoverImage, fetchStudioCoverImage, fetchMyAutopay, cancelMyAutopay } from "../api";
import ConfirmDialog from "../shared/ConfirmDialog";
import PinField, { isCompletePin } from "../shared/PinField";
import OrganiserProfileSectionsEditor from "../shared/OrganiserProfileSectionsEditor";
import FamilyPinSection from "../shared/FamilyPinSection";

// ---------------------------------------------------------------------------
// Manage Profile — reached from the profile menu. Edits photo, name, email,
// and phone — all saved to the real backend via AppContext's
// changePhoto()/updateProfile(). Photo is uploaded and stored on the
// server, so it persists across refresh, logout, and other devices.
// ---------------------------------------------------------------------------

export default function ManageProfilePage({ onBack }) {
  const { profile, changePhoto, updateProfile, refreshFamily } = useApp();
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

  const [aboutSections, setAboutSections] = useState([]);
  const [aboutLoading, setAboutLoading] = useState(true);
  const [aboutError, setAboutError] = useState("");

  const [coverImageUrl, setCoverImageUrl] = useState(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverError, setCoverError] = useState("");

  useEffect(() => {
    if (profile.role !== "plays_organiser") return;
    fetchMyOrganiserSections()
      .then(setAboutSections)
      .catch((err) => setAboutError(err.message || "Couldn't load your About page."))
      .finally(() => setAboutLoading(false));
    fetchStudioCoverImage(profile.id)
      .then((r) => setCoverImageUrl(r.cover_image_url))
      .catch(() => {});
  }, [profile.role, profile.id]);

  const handleUploadCover = async (file) => {
    if (!file) return;
    setUploadingCover(true);
    setCoverError("");
    try {
      const result = await uploadMyStudioCoverImage(file);
      setCoverImageUrl(result.cover_image_url);
    } catch (err) {
      setCoverError(err.message || "Couldn't upload cover image.");
    } finally {
      setUploadingCover(false);
    }
  };

  const handleCreateSection = async ({ title, contentHtml }) => {
    setAboutError("");
    try {
      const created = await createMyOrganiserSection({ title, contentHtml });
      setAboutSections((list) => [...list, created]);
    } catch (err) {
      setAboutError(err.message || "Couldn't add section.");
    }
  };

  const handleUpdateSection = async (id, { title, contentHtml }) => {
    setAboutError("");
    try {
      const updated = await updateMyOrganiserSection(id, { title, contentHtml });
      setAboutSections((list) => list.map((s) => (s.id === id ? updated : s)));
    } catch (err) {
      setAboutError(err.message || "Couldn't save section.");
    }
  };

  const handleDeleteSection = async (id) => {
    setAboutError("");
    try {
      await deleteMyOrganiserSection(id);
      setAboutSections((list) => list.filter((s) => s.id !== id));
    } catch (err) {
      setAboutError(err.message || "Couldn't delete section.");
    }
  };

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

  // --- Auto-renew (UPI Autopay) ---------------------------------------
  // The checkout screen promises "cancel any time from Manage Profile",
  // so it has to actually be here. It was only on the Subscription Plans
  // page, which is where someone goes to BUY — the last place a person
  // trying to stop paying thinks to look. A promise people can't find is
  // what turns a renewal into a dispute.
  const [autopay, setAutopay] = useState(null);
  const [cancellingAutopay, setCancellingAutopay] = useState(false);
  const [confirmCancelAutopay, setConfirmCancelAutopay] = useState(false);
  const [autopayError, setAutopayError] = useState("");

  const loadAutopay = async () => {
    try {
      setAutopay(await fetchMyAutopay());
    } catch {
      setAutopay(null);
    }
  };

  useEffect(() => {
    // Sub-accounts don't own the plan, so there is nothing here for them
    // to cancel — the parent holds the mandate.
    if (!profile?.parent_id) loadAutopay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.parent_id]);

  const handleCancelAutopay = async () => {
    setCancellingAutopay(true);
    setAutopayError("");
    try {
      await cancelMyAutopay();
      await loadAutopay();
    } catch (err) {
      setAutopayError(err.message || "Couldn't turn off auto-renew. Please try again.");
    } finally {
      setCancellingAutopay(false);
      setConfirmCancelAutopay(false);
    }
  };

  // --- Family Accounts (sub-account sharing this user's subscription screens) ---
  const [myParent, setMyParent] = useState(null);
  const [subAccountsInfo, setSubAccountsInfo] = useState(null);
  const [showCreateSubForm, setShowCreateSubForm] = useState(false);
  const [subName, setSubName] = useState("");
  const [subEmail, setSubEmail] = useState("");
  const [subPassword, setSubPassword] = useState("");
  // The parent's declaration, required before a sub-account can be created
  // (backend rejects the request without it) — null means "not yet chosen".
  // See UserDemographics' docstring: an adult-declared sub-account fills in
  // its own date of birth/city on its own first login; a minor never does.
  const [subIsMinor, setSubIsMinor] = useState(null);
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
    if (!subName.trim() || !subEmail.trim() || subPassword.length < 8 || subIsMinor === null) return;
    setSubError("");
    setCreatingSub(true);
    try {
      await createSubAccount({ name: subName.trim(), email: subEmail.trim(), password: subPassword, isMinor: subIsMinor });
      setSubName(""); setSubEmail(""); setSubPassword(""); setSubIsMinor(null);
      setShowCreateSubForm(false);
      loadFamilyInfo();
      refreshFamily();
    } catch (err) {
      setSubError(err.message || "Couldn't create the account. Please try again.");
    } finally {
      setCreatingSub(false);
    }
  };

  // --- Changing a family account's under-18 declaration -------------
  // Turning it OFF opens age-restricted content up, so the server asks
  // for the Family PIN when the family has one. We don't check that
  // here: we send without a PIN first, and a 400 naming the PIN is the
  // signal to prompt. That keeps one copy of the rule, on the server.
  const [minorDialog, setMinorDialog] = useState(null); // { sub, nextIsMinor }
  const [minorPin, setMinorPin] = useState("");
  const [minorBusy, setMinorBusy] = useState(false);
  const [minorError, setMinorError] = useState("");
  const [minorNeedsPin, setMinorNeedsPin] = useState(false);

  const openMinorDialog = (sub) => {
    setMinorDialog({ sub, nextIsMinor: !sub.is_minor });
    setMinorPin("");
    setMinorError("");
    setMinorNeedsPin(false);
  };

  const submitMinorChange = async () => {
    if (!minorDialog) return;
    setMinorError("");
    setMinorBusy(true);
    try {
      await setSubAccountMinor(minorDialog.sub.id, {
        isMinor: minorDialog.nextIsMinor,
        pin: minorNeedsPin ? minorPin : undefined,
      });
      setMinorDialog(null);
      setMinorPin("");
      loadFamilyInfo();
      refreshFamily();
    } catch (err) {
      const msg = err.message || "Couldn't save that change. Please try again.";
      // The server asks for the PIN by name; that is what turns the
      // field on. A wrong PIN comes back the same way, with its own
      // "attempts left" message, and the field stays up.
      if (/family pin/i.test(msg) || /incorrect pin/i.test(msg)) setMinorNeedsPin(true);
      setMinorError(msg);
      setMinorPin("");
    } finally {
      setMinorBusy(false);
    }
  };

  const handleDeactivateSubConfirmed = async () => {
    setDeactivatingSubId(confirmDeactivateSub.id);
    try {
      await deactivateSubAccount(confirmDeactivateSub.id);
      loadFamilyInfo();
      refreshFamily();
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

        {/* Auto-renew — only when one is actually running. Hidden for
            everyone else rather than shown as an empty "off" state,
            which would just be noise on a page people open for other
            reasons. */}
        {autopay?.active && (
          <>
            <div className="mb-8" />
            <div className="rounded-2xl p-6" style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.3)" }}>
              <h2 className="mb-1 flex items-center gap-2 text-base font-semibold" style={{ color: COLORS.cream }}>
                <RefreshCw className="h-4 w-4" style={{ color: COLORS.gold }} /> Auto-renew
              </h2>
              <p className="mb-4 text-sm" style={{ color: "rgba(245,235,221,0.65)" }}>
                Your {autopay.plan_name} plan renews automatically. ₹{autopay.total_amount} will be
                charged via UPI Autopay
                {autopay.next_renewal_at
                  ? ` around ${new Date(autopay.next_renewal_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`
                  : ""}
                , then every {String(autopay.duration_label || "").toLowerCase()}.
              </p>

              {autopayError && (
                <div className="mb-4 rounded-lg px-3 py-2 text-sm font-medium" style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}>
                  {autopayError}
                </div>
              )}

              <button
                type="button"
                disabled={cancellingAutopay}
                onClick={() => setConfirmCancelAutopay(true)}
                className="rounded-full px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ border: "1px solid rgba(248,113,113,0.5)", color: "#f87171" }}
              >
                {cancellingAutopay ? "Turning off…" : "Turn off auto-renew"}
              </button>
              <p className="mt-3 text-xs" style={{ color: "rgba(245,235,221,0.45)" }}>
                You keep access until the period you have already paid for ends.
              </p>
            </div>
          </>
        )}

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

        {profile.role === "plays_organiser" && (
          <div className="mt-6 rounded-2xl p-6" style={{ background: COLORS.blackSoft, border: "1px solid rgba(255,255,255,0.08)" }}>
            <h2 className="mb-1 flex items-center gap-2 text-base font-semibold" style={{ color: COLORS.cream }}>
              <BookOpen className="h-4 w-4" style={{ color: COLORS.gold }} /> About {profile.name}
            </h2>
            <p className="mb-4 text-sm" style={{ color: "rgba(245,235,221,0.5)" }}>
              Tell people about your organisation — add sections like About, Early Days, Selected Plays, or Awards.
            </p>

            <div className="mb-6">
              <label style={{ marginBottom: 8, display: "block", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em", color: "rgba(245,235,221,0.5)" }}>
                Cover Image
              </label>
              {coverImageUrl && (
                <div className="mb-3 overflow-hidden rounded-xl" style={{ aspectRatio: "16 / 6", border: "1px solid rgba(245,235,221,0.15)" }}>
                  <img src={coverImageUrl} alt="" className="h-full w-full object-cover" />
                </div>
              )}
              {coverError && <p className="mb-2 text-xs font-medium" style={{ color: "#f87171" }}>{coverError}</p>}
              <label
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-3 text-sm font-medium hover:opacity-80"
                style={{ borderColor: "rgba(212,175,55,0.3)", color: uploadingCover ? "rgba(245,235,221,0.4)" : COLORS.gold }}
              >
                <ImagePlus className="h-4 w-4" />
                {uploadingCover ? "Uploading…" : coverImageUrl ? "Replace cover image" : "Upload a cover image"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploadingCover}
                  className="hidden"
                  onChange={(e) => handleUploadCover(e.target.files?.[0])}
                />
              </label>
              <p className="mt-1.5 text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>
                Shown at the top of your video list (e.g. "{profile.name} — Contemporary"). Recommended: a wide banner image, at least 1600px across.
              </p>
            </div>

            <OrganiserProfileSectionsEditor
              sections={aboutSections}
              loading={aboutLoading}
              error={aboutError}
              onCreate={handleCreateSection}
              onUpdate={handleUpdateSection}
              onDelete={handleDeleteSection}
            />
          </div>
        )}

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
                        {s.is_active && (
                          // The badge is also the control: tapping it is how a
                          // parent corrects the declaration. Every family
                          // account made before this existed starts as "Minor",
                          // which is the safe default but not always the true
                          // one, so there has to be a way out.
                          <button
                            type="button"
                            onClick={() => openMinorDialog(s)}
                            title={s.is_minor
                              ? "Marked as being for someone under 18 — tap to change"
                              : "Marked as 18 or over — tap to change"}
                            className="ml-1.5 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase"
                            style={s.is_minor
                              ? { background: "rgba(245,235,221,0.08)", color: "rgba(245,235,221,0.5)", border: "1px solid rgba(245,235,221,0.15)" }
                              : { background: "rgba(212,175,55,0.15)", color: COLORS.gold, border: "1px solid rgba(212,175,55,0.3)" }}
                          >
                            {s.is_minor ? "Minor" : "Adult"}
                          </button>
                        )}
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

            <FamilyPinSection />

            {subAccountsInfo.sub_accounts.filter((s) => s.is_active).length < subAccountsInfo.max_allowed && (
              showCreateSubForm ? (
                <div className="rounded-lg p-4" style={{ background: "rgba(245,235,221,0.03)", border: "1px solid rgba(212,175,55,0.2)" }}>
                  <div className="mb-3">
                    <input type="text" placeholder="Name" value={subName} onChange={(e) => setSubName(e.target.value)} style={inputStyle} className="mb-2" />
                    <input type="email" placeholder="Email" value={subEmail} onChange={(e) => setSubEmail(e.target.value)} style={inputStyle} className="mb-2" />
                    <input type="password" placeholder="Password (min. 8 characters)" value={subPassword} onChange={(e) => setSubPassword(e.target.value)} style={inputStyle} className="mb-3" />
                    <p className="mb-1.5 text-xs font-medium" style={{ color: "rgba(245,235,221,0.7)" }}>Is this account for someone under 18?</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSubIsMinor(true)}
                        className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold"
                        style={subIsMinor === true
                          ? { background: COLORS.gold, color: "#0a0104" }
                          : { border: "1px solid rgba(245,235,221,0.2)", color: "rgba(245,235,221,0.7)" }}
                      >
                        Yes, under 18
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubIsMinor(false)}
                        className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold"
                        style={subIsMinor === false
                          ? { background: COLORS.gold, color: "#0a0104" }
                          : { border: "1px solid rgba(245,235,221,0.2)", color: "rgba(245,235,221,0.7)" }}
                      >
                        No, 18 or older
                      </button>
                    </div>
                    <p className="mt-1.5 text-[11px]" style={{ color: "rgba(245,235,221,0.45)" }}>
                      {subIsMinor === true
                        ? "This account will never be asked for date of birth or city."
                        : subIsMinor === false
                        ? "This account will be asked to add its own date of birth and city the first time it logs in."
                        : "This can't be changed later, so please choose carefully."}
                    </p>
                  </div>
                  {subError && <p className="mb-3 text-xs font-medium" style={{ color: "#f87171" }}>{subError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCreateSubAccount}
                      disabled={creatingSub || !subName.trim() || !subEmail.trim() || subPassword.length < 8 || subIsMinor === null}
                      className="rounded-full px-5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ background: COLORS.gold, color: "#0a0104" }}
                    >
                      {creatingSub ? "Creating…" : "Create"}
                    </button>
                    <button type="button" onClick={() => { setShowCreateSubForm(false); setSubError(""); setSubIsMinor(null); }} className="rounded-full px-4 py-2 text-xs font-medium" style={{ color: "rgba(245,235,221,0.5)" }}>
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

      {/* Changing a family account's under-18 declaration. Not a plain
          ConfirmDialog because turning it off may need the Family PIN,
          and because the two directions deserve different words: one
          opens content up, the other closes it. */}
      {minorDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          onClick={() => !minorBusy && setMinorDialog(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: COLORS.blackSoft, border: "1px solid rgba(212,175,55,0.25)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-base font-semibold" style={{ color: COLORS.cream }}>
              {minorDialog.nextIsMinor ? "Mark as under 18" : "Mark as 18 or over"}
            </h3>
            <p className="mb-4 text-sm" style={{ color: "rgba(245,235,221,0.6)" }}>
              {minorDialog.nextIsMinor
                ? `${minorDialog.sub.name} will stop seeing age-restricted content, including 18+. Date of birth and city won't be asked for or kept for this account.`
                : `${minorDialog.sub.name} will be able to watch age-restricted content, including 18+. Only do this if this account really is for someone 18 or over. We'll let you know by WhatsApp and email that this changed.`}
            </p>

            {minorNeedsPin && (
              <div className="mb-4">
                <p className="mb-2 text-xs font-medium" style={{ color: "rgba(245,235,221,0.7)" }}>
                  Enter your Family PIN to confirm
                </p>
                <PinField
                  value={minorPin}
                  onChange={setMinorPin}
                  onEnter={submitMinorChange}
                  disabled={minorBusy}
                  ariaLabel="Family PIN"
                  autoFocus
                />
              </div>
            )}

            {minorError && (
              <p className="mb-3 text-xs" style={{ color: "#f87171" }}>{minorError}</p>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setMinorDialog(null)}
                disabled={minorBusy}
                className="rounded-full px-4 py-2 text-xs font-medium hover:opacity-80"
                style={{ color: "rgba(245,235,221,0.6)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitMinorChange}
                disabled={minorBusy || (minorNeedsPin && !isCompletePin(minorPin))}
                className="rounded-full px-5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: COLORS.gold, color: "#0a0104" }}
              >
                {minorBusy ? "Working…" : minorDialog.nextIsMinor ? "Mark as under 18" : "Mark as 18 or over"}
              </button>
            </div>
          </div>
        </div>
      )}

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

      <ConfirmDialog
        open={confirmCancelAutopay}
        title="Turn off auto-renew"
        message={
          autopay?.next_renewal_at
            ? `No further payments will be taken. You keep ${autopay.plan_name} until ${new Date(autopay.next_renewal_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}, then access ends.`
            : "No further payments will be taken. You keep access until the period you have already paid for ends."
        }
        confirmLabel="Turn off"
        danger
        busy={cancellingAutopay}
        onCancel={() => setConfirmCancelAutopay(false)}
        onConfirm={handleCancelAutopay}
      />
    </div>
  );
}
