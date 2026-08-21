import { useEffect, useState } from "react";
import { Menu, X, Search, ChevronDown } from "lucide-react";
import { COLORS, CTA_GRADIENT, CTA_TEXT_COLOR, NAV_GRADIENT } from "../theme";
import { useApp } from "../context/AppContext";
import { redirectToGoogleLogin, redirectToFacebookLogin, requestPasswordReset, fetchMenus } from "../api";

// ---------------------------------------------------------------------------
// Login backdrop video — its own dedicated folder, completely independent
// of src/assets/HeroVideo/ (the Play section's hero video folder). Drop any
// video file in here and it plays behind the login modal automatically; if
// the folder is empty, the modal just falls back to a plain dark backdrop.
// ---------------------------------------------------------------------------
const loginVideoModules = import.meta.glob("../assets/LoginVideo/*.{mp4,webm,mov,MP4,WEBM,MOV}", {
  eager: true,
  query: "?url",
  import: "default",
});
const LOGIN_VIDEOS = Object.keys(loginVideoModules).sort().map((key) => loginVideoModules[key]);

// ---------------------------------------------------------------------------
// TopNav — the ONE nav bar for the whole site.
//
// Rendered once at the App level, fixed to the top of the viewport, so it:
//   - sits over every Hero (Video Streaming / Movies / Theater)
//   - stays visible while scrolling into the Browse feed below
//   - carries the always-visible search box
//
// Navigation is loaded from GET /api/menus (a flat list) rather than
// hardcoded — a menu item with view === null (e.g. "Category") is treated
// as a dropdown trigger, and its children are whichever other menu items
// have parent_menu_id pointing at it. This is driven entirely by the
// `menus` database table, editable from the future admin panel at
// theomy.com/admin.
//
// onNavigate(view, params) — params lets links carry extra context, e.g.
// { category: "Drama" } for a Category dropdown item.
// ---------------------------------------------------------------------------

export default function TopNav({ query, onQueryChange, onNavigate, activeView }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [localQuery, setLocalQuery] = useState(query ?? "");
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [mobileCategoryOpen, setMobileCategoryOpen] = useState(false);
  const [menuItems, setMenuItems] = useState([]);

  const {
    isLoggedIn, isSubscribed, profile, showLoginModal,
    requestLogin, closeLoginModal, login, logout, changePhoto,
  } = useApp();

  // Menus are public (no auth needed) and rarely change, so one fetch on
  // mount is enough — no need to refetch on every login/logout.
  useEffect(() => {
    fetchMenus()
      .then(setMenuItems)
      .catch(() => setMenuItems([])); // nav just shows nothing extra if this fails
  }, []);

  const topMenus = [...menuItems]
    .filter((m) => !m.parent_menu_id)
    .sort((a, b) => a.display_order - b.display_order);

  const childrenOf = (parentId) =>
    menuItems
      .filter((m) => m.parent_menu_id === parentId)
      .sort((a, b) => a.display_order - b.display_order);

  const handleMenuClick = (menu) => {
    if (menu.requires_auth && !isLoggedIn) {
      requestLogin();
      setMenuOpen(false);
      return;
    }
    if (menu.view === "category" && menu.category_param) {
      onNavigate?.("category", { category: menu.category_param });
    } else if (menu.view) {
      onNavigate?.(menu.view);
    }
    setCategoryMenuOpen(false);
    setMobileCategoryOpen(false);
    setMenuOpen(false);
  };

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const updateQuery = (v) => {
    setLocalQuery(v);
    onQueryChange?.(v);
  };

  return (
    <>
      <nav
        className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between gap-3 px-5 py-4 sm:px-8 lg:px-12"
        style={{
          background: NAV_GRADIENT,
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderBottom: `1px solid rgba(212,175,55,0.18)`,
        }}
      >
        {/* Logo */}
        <div className="flex flex-shrink-0 items-center gap-2" style={{ color: COLORS.cream }}>
          <MovixMark className="h-6 w-6" style={{ fill: COLORS.gold }} />
          <span className="text-lg font-semibold tracking-wide">theomy</span>
        </div>

        {/* Desktop menu */}
        <div
          className="hidden items-center gap-0.5 rounded-full px-1.5 py-1.5 lg:flex"
          style={{ background: "rgba(245,235,221,0.06)" }}
        >
          {topMenus.map((menu) => {
            // A menu with no `view` of its own (e.g. "Category") is a
            // dropdown trigger — its destinations live in its children.
            if (!menu.view) {
              const children = childrenOf(menu.id);
              return (
                <div
                  key={menu.id}
                  className="relative"
                  onMouseEnter={() => setCategoryMenuOpen(true)}
                  onMouseLeave={() => setCategoryMenuOpen(false)}
                >
                  <button
                    className="flex items-center gap-1 rounded-full px-3.5 py-1.5 text-base font-medium transition-colors hover:bg-white/10"
                    style={{
                      color: activeView === "category" ? COLORS.gold : "rgba(245,235,221,0.82)",
                      background: activeView === "category" ? "rgba(212,175,55,0.14)" : "transparent",
                    }}
                  >
                    {menu.label} <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  {categoryMenuOpen && children.length > 0 && (
                    <div className="absolute left-0 top-full w-56 overflow-hidden rounded-xl pt-1">
                      <div style={{ background: COLORS.blackSoft, border: `1px solid rgba(212,175,55,0.2)`, borderRadius: 12 }}>
                        {children.map((child) => (
                          <button
                            key={child.id}
                            onClick={() => handleMenuClick(child)}
                            className="block w-full px-4 py-2.5 text-left text-sm font-medium transition-colors hover:bg-white/10"
                            style={{ color: "rgba(245,235,221,0.85)" }}
                          >
                            {child.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            const isActive = menu.view === activeView;
            return (
              <button
                key={menu.id}
                onClick={() => handleMenuClick(menu)}
                className="rounded-full px-3.5 py-1.5 text-base font-medium transition-colors hover:bg-white/10"
                style={{
                  color: isActive ? COLORS.gold : "rgba(245,235,221,0.82)",
                  background: isActive ? "rgba(212,175,55,0.14)" : "transparent",
                }}
              >
                {menu.label}
              </button>
            );
          })}
        </div>

        {/* Search (always visible) + auth */}
        <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
          <div
            className="flex items-center overflow-hidden rounded-full"
            style={{ border: `1px solid rgba(212,175,55,0.4)` }}
          >
            <input
              type="text"
              value={localQuery}
              onChange={(e) => updateQuery(e.target.value)}
              placeholder="Search"
              className="w-24 bg-transparent px-3 py-1.5 text-sm outline-none placeholder-white/40 sm:w-40 sm:px-4 md:w-56"
              style={{ color: COLORS.cream }}
            />
            <button
              type="button"
              className="flex items-center justify-center px-3 py-1.5 text-white sm:px-4"
              style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          </div>

          {isLoggedIn && !isSubscribed && (
            <button
              type="button"
              onClick={() => onNavigate?.("subscription")}
              className="hidden flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-opacity hover:opacity-90 sm:block"
              style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            >
              Subscribe
            </button>
          )}

          {isLoggedIn ? (
            <div className="relative hidden sm:block">
              <button
                onClick={() => setShowProfileMenu((v) => !v)}
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border text-sm font-semibold"
                style={{ borderColor: "rgba(212,175,55,0.4)", background: "rgba(245,235,221,0.08)", color: COLORS.cream }}
              >
                {profile.photo ? (
                  <img src={profile.photo} alt="" className="h-full w-full object-cover" />
                ) : (
                  (profile.name || "?")[0].toUpperCase()
                )}
              </button>
              {showProfileMenu && (
                <ProfileMenu
                  profile={profile}
                  onPhotoChange={changePhoto}
                  onClose={() => setShowProfileMenu(false)}
                  onNavigate={onNavigate}
                  onLogout={logout}
                />
              )}
            </div>
          ) : (
            <button
              onClick={requestLogin}
              className="hidden rounded-full px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:block"
              style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            >
              Login
            </button>
          )}

          {/* Mobile hamburger */}
          <button
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((v) => !v)}
            className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full lg:hidden"
            style={{ background: "rgba(245,235,221,0.08)" }}
          >
            <Menu
              className={`absolute h-5 w-5 transition-all duration-300 ${
                menuOpen ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
              }`}
              style={{ color: COLORS.cream }}
            />
            <X
              className={`absolute h-5 w-5 transition-all duration-300 ${
                menuOpen ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
              }`}
              style={{ color: COLORS.cream }}
            />
          </button>
        </div>
      </nav>

      {/* Mobile overlay + drawer */}
      <div
        className={`fixed inset-0 z-40 bg-black/80 backdrop-blur-md transition-opacity duration-300 lg:hidden ${
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMenuOpen(false)}
      />
      <div
        className={`fixed right-0 top-0 z-40 flex h-full w-72 flex-col overflow-y-auto transition-transform duration-500 lg:hidden ${
          menuOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{
          transitionTimingFunction: "cubic-bezier(0.16,1,0.3,1)",
          background: NAV_GRADIENT,
          backdropFilter: "blur(20px)",
        }}
      >
        <div className="flex flex-col gap-2 px-6 pt-24">
          {topMenus.map((menu, i) => {
            if (!menu.view) {
              const children = childrenOf(menu.id);
              return (
                <div key={menu.id}>
                  <button
                    onClick={() => setMobileCategoryOpen((v) => !v)}
                    className="flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-base font-medium transition-colors hover:bg-white/10"
                    style={{
                      color: "rgba(245,235,221,0.85)",
                      opacity: menuOpen ? 1 : 0,
                      transform: menuOpen ? "translateX(0)" : "translateX(24px)",
                      transitionProperty: "opacity, transform, background-color, color",
                      transitionDuration: "300ms",
                      transitionDelay: `${(i + 1) * 60}ms`,
                    }}
                  >
                    {menu.label}
                    <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${mobileCategoryOpen ? "rotate-180" : ""}`} />
                  </button>
                  {mobileCategoryOpen && children.length > 0 && (
                    <div className="ml-3 flex flex-col gap-1 border-l pl-3" style={{ borderColor: "rgba(212,175,55,0.25)" }}>
                      {children.map((child) => (
                        <button
                          key={child.id}
                          onClick={() => handleMenuClick(child)}
                          className="rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10"
                          style={{ color: "rgba(245,235,221,0.75)" }}
                        >
                          {child.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            const isActive = menu.view === activeView;
            return (
              <button
                key={menu.id}
                onClick={() => handleMenuClick(menu)}
                className="flex items-center justify-between rounded-xl px-4 py-3.5 text-base font-medium transition-colors hover:bg-white/10"
                style={{
                  color: isActive ? COLORS.gold : "rgba(245,235,221,0.85)",
                  background: isActive ? "rgba(212,175,55,0.12)" : "transparent",
                  opacity: menuOpen ? 1 : 0,
                  transform: menuOpen ? "translateX(0)" : "translateX(24px)",
                  transitionProperty: "opacity, transform, background-color, color",
                  transitionDuration: "300ms",
                  transitionDelay: `${(i + 1) * 60}ms`,
                }}
              >
                {menu.label}
              </button>
            );
          })}
        </div>

        <div
          className="mt-auto px-6 pb-10 transition-all duration-400"
          style={{
            opacity: menuOpen ? 1 : 0,
            transform: menuOpen ? "translateY(0)" : "translateY(16px)",
            transitionDelay: "300ms",
          }}
        >
          {isLoggedIn ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "rgba(245,235,221,0.08)" }}>
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border text-sm font-semibold"
                  style={{ borderColor: "rgba(212,175,55,0.4)", color: COLORS.cream }}
                >
                  {profile.photo ? (
                    <img src={profile.photo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (profile.name || "?")[0].toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" style={{ color: COLORS.cream }}>{profile.name || "Signed in"}</p>
                  <p className="truncate text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{profile.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { onNavigate?.("manageProfile"); setMenuOpen(false); }}
                className="rounded-full px-4 py-2.5 text-sm font-medium"
                style={{ border: "1px solid rgba(212,175,55,0.4)", color: COLORS.gold }}
              >
                Manage Profile
              </button>
              <button
                type="button"
                onClick={() => { onNavigate?.("subscription"); setMenuOpen(false); }}
                className="rounded-full px-4 py-2.5 text-sm font-medium"
                style={{ border: "1px solid rgba(212,175,55,0.4)", color: COLORS.gold }}
              >
                Subscription Plans
              </button>
              <button
                type="button"
                onClick={() => { onNavigate?.("help"); setMenuOpen(false); }}
                className="rounded-full px-4 py-2.5 text-sm font-medium"
                style={{ border: "1px solid rgba(212,175,55,0.4)", color: COLORS.gold }}
              >
                Help Center
              </button>
              {(profile.role === "Content Creator" || profile.role === "Plays Organiser") && (
                <>
                  <button
                    type="button"
                    onClick={() => { onNavigate?.("myVideos"); setMenuOpen(false); }}
                    className="rounded-full px-4 py-2.5 text-sm font-medium"
                    style={{ border: "1px solid rgba(212,175,55,0.4)", color: COLORS.gold }}
                  >
                    My Video List
                  </button>
                  <button
                    type="button"
                    onClick={() => { onNavigate?.("revenue"); setMenuOpen(false); }}
                    className="rounded-full px-4 py-2.5 text-sm font-medium"
                    style={{ border: "1px solid rgba(212,175,55,0.4)", color: COLORS.gold }}
                  >
                    Revenue
                  </button>
                  <button
                    type="button"
                    onClick={() => { onNavigate?.("eventEnquiry"); setMenuOpen(false); }}
                    className="rounded-full px-4 py-2.5 text-sm font-medium"
                    style={{ border: "1px solid rgba(212,175,55,0.4)", color: COLORS.gold }}
                  >
                    Event Listing Enquiry
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  logout();
                  setMenuOpen(false);
                }}
                className="rounded-full px-4 py-2.5 text-sm font-medium"
                style={{ border: "1px solid rgba(245,235,221,0.2)", color: "rgba(245,235,221,0.7)" }}
              >
                Log out
              </button>
            </div>
          ) : (
            <button
              onClick={requestLogin}
              className="w-full rounded-full px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            >
              Login
            </button>
          )}
        </div>
      </div>

      {showLoginModal && (
        <LoginModal onClose={closeLoginModal} />
      )}
    </>
  );
}

// Real auth — talks to the theomy backend (register/login with
// bcrypt+JWT), plus working Google/Facebook OAuth redirects.
function LoginModal({ onClose }) {
  const { login, register, authError } = useApp();
  const [mode, setMode] = useState("login"); // "login" | "register" | "forgot"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("User");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  const canSubmit =
    mode === "login"
      ? email.trim() && password
      : mode === "forgot"
      ? email.trim()
      : name.trim() && email.trim() && password.length >= 8;

  const ROLES = ["User", "Content Creator", "Plays Organiser"];

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setFormError("");
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else if (mode === "forgot") {
        await requestPasswordReset({ email: email.trim() });
        setForgotSent(true);
      } else {
        await register({
          name: name.trim(),
          email: email.trim(),
          password,
          phone: phone.trim(),
          role,
        });
      }
    } catch (err) {
      setFormError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Curtain video backdrop — plays if a file exists in
          assets/LoginVideo/, otherwise this layer is simply absent and the
          plain dark background below shows instead */}
      {LOGIN_VIDEOS.length > 0 && (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src={LOGIN_VIDEOS[0]}
          autoPlay
          muted
          loop
          playsInline
        />
      )}
      {/* Dark overlay — lighter than a flat solid so the video reads through
          it, but still dark enough to keep the login card legible */}
      <div className="absolute inset-0" style={{ background: "rgba(10,1,4,0.72)" }} />

      <div
        className="relative z-10 w-full max-w-sm rounded-2xl p-6"
        style={{ background: COLORS.blackSoft, border: `1px solid rgba(212,175,55,0.2)` }}
      >
        <h2 className="mb-1 text-xl font-semibold" style={{ color: COLORS.cream }}>
          {mode === "login" ? "Log in to theomy" : mode === "forgot" ? "Reset your password" : "Create your account"}
        </h2>
        <p className="mb-4 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>
          {mode === "login"
            ? "Log in to continue browsing theomy."
            : mode === "forgot"
            ? "Enter your email and we'll send you a reset link."
            : "Login is required to browse theomy."}
        </p>

        {mode !== "forgot" && (
          <>
            {/* Social login */}
            <div className="mb-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={redirectToGoogleLogin}
                className="flex items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium hover:bg-white/5"
                style={{ borderColor: "rgba(245,235,221,0.2)", color: COLORS.cream }}
              >
                <GoogleMark className="h-4 w-4" /> Continue with Google
              </button>
              <button
                type="button"
                onClick={redirectToFacebookLogin}
                className="flex items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium hover:bg-white/5"
                style={{ borderColor: "rgba(245,235,221,0.2)", color: COLORS.cream }}
              >
                <FacebookMark className="h-4 w-4" /> Continue with Facebook
              </button>
            </div>

            <div className="mb-4 flex items-center gap-3">
              <div className="h-px flex-1" style={{ background: "rgba(245,235,221,0.12)" }} />
              <span className="text-xs" style={{ color: "rgba(245,235,221,0.4)" }}>or</span>
              <div className="h-px flex-1" style={{ background: "rgba(245,235,221,0.12)" }} />
            </div>
          </>
        )}

        {mode === "forgot" && forgotSent ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm" style={{ color: "rgba(245,235,221,0.75)" }}>
              If an account exists for that email, a reset link has been sent. Check your inbox (and spam folder).
            </p>
            <button
              onClick={() => { setMode("login"); setForgotSent(false); }}
              className="mt-1 rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
            >
              Back to login
            </button>
          </div>
        ) : (
        <div className="flex flex-col gap-3">
          {mode === "register" && (
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border px-4 py-2.5 text-sm outline-none"
              style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="rounded-lg border px-4 py-2.5 text-sm outline-none"
            style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
          />
          {mode !== "forgot" && (
            <input
              type="password"
              placeholder={mode === "register" ? "Password (min. 8 characters)" : "Password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="rounded-lg border px-4 py-2.5 text-sm outline-none"
              style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
            />
          )}

          {mode === "login" && (
            <div className="-mt-1 flex justify-end">
              <button
                type="button"
                onClick={() => { setFormError(""); setMode("forgot"); }}
                className="text-xs font-medium hover:opacity-90"
                style={{ color: "rgba(245,235,221,0.55)" }}
              >
                Forgot password?
              </button>
            </div>
          )}

          {mode === "register" && (
            <input
              type="tel"
              placeholder="Phone number (optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-lg border px-4 py-2.5 text-sm outline-none"
              style={{ borderColor: "rgba(245,235,221,0.15)", background: "rgba(245,235,221,0.05)", color: COLORS.cream }}
            />
          )}

          {mode === "register" && (
            <div>
              <p className="mb-1.5 text-xs font-medium" style={{ color: "rgba(245,235,221,0.6)" }}>I am a...</p>
              <div className="flex flex-wrap gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className="rounded-full border px-3 py-1.5 text-xs font-medium"
                    style={{
                      borderColor: role === r ? COLORS.gold : "rgba(245,235,221,0.15)",
                      background: role === r ? "rgba(212,175,55,0.14)" : "transparent",
                      color: role === r ? COLORS.gold : "rgba(245,235,221,0.7)",
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(formError || authError) && (
            <p className="text-xs font-medium" style={{ color: "#f87171" }}>
              {formError || authError}
            </p>
          )}

          <button
            disabled={!canSubmit || submitting}
            onClick={handleSubmit}
            className="mt-1 rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: CTA_GRADIENT, color: CTA_TEXT_COLOR }}
          >
            {submitting
              ? mode === "login" ? "Logging in…" : mode === "forgot" ? "Sending…" : "Creating account…"
              : mode === "login" ? "Log in" : mode === "forgot" ? "Send reset link" : "Create account"}
          </button>

          <div className="mt-1 flex items-center justify-end">
            {mode === "forgot" ? (
              <button
                onClick={() => { setFormError(""); setMode("login"); }}
                className="text-xs font-medium hover:opacity-90"
                style={{ color: COLORS.gold }}
              >
                Back to login
              </button>
            ) : (
              <button
                onClick={() => { setFormError(""); setMode((m) => (m === "login" ? "register" : "login")); }}
                className="text-xs font-medium hover:opacity-90"
                style={{ color: COLORS.gold }}
              >
                {mode === "login" ? "New Registration" : "Already have an account? Log in"}
              </button>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

function GoogleMark({ className }) {
  return (
    <svg className={className} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.4 0 10.3-2.1 13.9-5.4l-6.4-5.4C29.4 34.7 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.6 39.6 16.3 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.3 4.1-4.2 5.4l6.4 5.4C40.9 36 44 30.8 44 24c0-1.3-.1-2.7-.4-3.5z"/>
    </svg>
  );
}

function FacebookMark({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="#1877F2" xmlns="http://www.w3.org/2000/svg">
      <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z"/>
    </svg>
  );
}

function ProfileMenu({ profile, onPhotoChange, onClose, onNavigate, onLogout }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute right-0 top-11 z-50 w-56 rounded-xl p-4 shadow-xl"
        style={{ background: COLORS.blackSoft, border: `1px solid rgba(212,175,55,0.2)` }}
      >
        <button
          type="button"
          onClick={() => { onNavigate?.("manageProfile"); onClose(); }}
          className="mb-3 block w-full text-left text-sm font-medium hover:opacity-90"
          style={{ color: COLORS.gold }}
        >
          Manage Profile
        </button>
        <button
          type="button"
          onClick={() => { onNavigate?.("subscription"); onClose(); }}
          className="mb-3 block w-full text-left text-sm font-medium hover:opacity-90"
          style={{ color: COLORS.gold }}
        >
          Subscription Plans
        </button>
        <button
          type="button"
          onClick={() => { onNavigate?.("help"); onClose(); }}
          className="mb-3 block w-full text-left text-sm font-medium hover:opacity-90"
          style={{ color: COLORS.gold }}
        >
          Help Center
        </button>
        {(profile.role === "Content Creator" || profile.role === "Plays Organiser") && (
          <>
            <button
              type="button"
              onClick={() => { onNavigate?.("myVideos"); onClose(); }}
              className="mb-3 block w-full text-left text-sm font-medium hover:opacity-90"
              style={{ color: COLORS.gold }}
            >
              My Video List
            </button>
            <button
              type="button"
              onClick={() => { onNavigate?.("revenue"); onClose(); }}
              className="mb-3 block w-full text-left text-sm font-medium hover:opacity-90"
              style={{ color: COLORS.gold }}
            >
              Revenue
            </button>
            <button
              type="button"
              onClick={() => { onNavigate?.("eventEnquiry"); onClose(); }}
              className="mb-3 block w-full text-left text-sm font-medium hover:opacity-90"
              style={{ color: COLORS.gold }}
            >
              Event Listing Enquiry
            </button>
          </>
        )}
        <div className="border-t pt-3" style={{ borderColor: "rgba(245,235,221,0.12)" }}>
          <p className="text-sm font-medium" style={{ color: COLORS.cream }}>{profile.name || "—"}</p>
          <p className="mt-1 text-xs" style={{ color: "rgba(245,235,221,0.5)" }}>{profile.email || "—"}</p>
          {profile.role && (
            <span className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "rgba(212,175,55,0.12)", color: COLORS.gold }}>
              {profile.role}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            onLogout?.();
            onClose();
          }}
          className="mt-3 block w-full border-t pt-3 text-left text-sm font-medium hover:opacity-80"
          style={{ borderColor: "rgba(245,235,221,0.12)", color: "rgba(245,235,221,0.7)" }}
        >
          Log out
        </button>
      </div>
    </>
  );
}

function MovixMark({ className, style }) {
  return (
    <svg viewBox="0 0 256 256" className={className} style={style} xmlns="http://www.w3.org/2000/svg">
      <path d="M 128 128 C 128 198.692 70.692 256 0 256 C 0 185.308 57.308 128 128 128 Z M 128 128 C 198.692 128 256 185.308 256 256 C 185.308 256 128 198.692 128 128 Z M 0 0 C 70.692 0 128 57.308 128 128 C 57.308 128 0 70.692 0 0 Z M 256 0 C 256 70.692 198.692 128 128 128 C 128 57.308 185.308 0 256 0 Z" />
    </svg>
  );
}
