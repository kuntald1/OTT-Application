// Carrying a referral code from a shared link to the account it creates.
//
// Someone taps a WhatsApp invite, lands on theomy.com/register?ref=AB12CD34,
// and signs up — possibly with Google, possibly after wandering around
// the site first, possibly after an OAuth round trip that throws the
// original URL away. The code has to survive all of that, so it is
// lifted off the URL the moment the page loads and kept in
// sessionStorage until the account exists and has claimed it.
//
// sessionStorage, not localStorage: the code belongs to this visit. A
// code left behind for weeks would eventually attach itself to some
// unrelated signup on a shared computer.

const KEY = "theomy_referral_code";

// Private browsing and locked-down site data make these throw rather
// than return null, so every access is wrapped. A referral that fails to
// carry is a missed bonus; a crashed page is a lost customer.
function read() {
  try {
    return window.sessionStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

function write(code) {
  try {
    window.sessionStorage.setItem(KEY, code);
  } catch {
    // Ignored — the code just won't survive a page reload.
  }
}

/**
 * Take ?ref=CODE off the current URL, remember it, and tidy the address
 * bar. Safe to call more than once. Returns the code, or null.
 */
export function captureReferralCodeFromUrl() {
  let code = null;
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("ref") || params.get("referral");
    if (raw) {
      code = raw.trim().toUpperCase().slice(0, 16);
      write(code);
      // Drop ?ref= from the address bar so a reload, a bookmark or a
      // copied URL doesn't carry someone else's code around. The stored
      // copy is what matters from here on.
      params.delete("ref");
      params.delete("referral");
      const query = params.toString();
      window.history.replaceState(
        {}, "",
        window.location.pathname + (query ? `?${query}` : "") + window.location.hash,
      );
    }
  } catch {
    // A malformed URL isn't worth failing the page load over.
  }
  return code || read();
}

export function getPendingReferralCode() {
  return read();
}

/**
 * Remember a code the visitor typed in by hand, for someone who was sent
 * the code itself rather than the link. It lands in the same slot the
 * link uses, so the claim that runs after signup needs to know nothing
 * about where the code came from.
 */
export function setPendingReferralCode(code) {
  const clean = String(code || "").trim().toUpperCase().slice(0, 16);
  if (clean) write(clean);
}

export function clearPendingReferralCode() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Ignored.
  }
}

/** True when the visitor arrived on theomy.com/register. */
export function isRegisterLanding() {
  try {
    return window.location.pathname.replace(/\/+$/, "") === "/register";
  } catch {
    return false;
  }
}
