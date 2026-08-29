// src/api.js
//
// All calls to the theomy backend go through here. Base URL is relative
// (/api/...) so it works whether you're on https://theomy.com in production
// or hitting a local backend via Vite's dev proxy — no env var needed.

const BASE_URL = "/api";

const TOKEN_KEY = "theomy_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // FastAPI puts validation/auth errors in `detail`
    const message =
      typeof data.detail === "string"
        ? data.detail
        : "Something went wrong. Please try again.";
    throw new Error(message);
  }

  return data;
}

export function registerUser({ name, email, password, phone, country, otp, role }) {
  return request("/auth/register", {
    method: "POST",
    body: { name, email, password, phone: phone || null, country, otp: otp || null, role },
  });
}

export function loginUser({ email, password }) {
  return request("/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export function sendOtp(phone, purpose) {
  return request("/auth/otp/send", {
    method: "POST",
    body: { phone, purpose },
  });
}

export function loginWithOtp(phone, otp) {
  return request("/auth/login-otp", {
    method: "POST",
    body: { phone, otp },
  });
}

export function fetchCurrentUser() {
  return request("/auth/me", { auth: true });
}

export function updateCurrentUser({ name, email, phone }) {
  return request("/auth/me", {
    method: "PUT",
    auth: true,
    body: { name, email, phone },
  });
}

// File upload — deliberately NOT using the shared `request()` helper above,
// since it always sets Content-Type: application/json. For multipart
// uploads the browser must set its own Content-Type (with the boundary),
// so we build this fetch call by hand.
export async function uploadProfilePhoto(file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/auth/me/photo`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      typeof data.detail === "string"
        ? data.detail
        : "Couldn't upload photo. Please try again.";
    throw new Error(message);
  }

  return data;
}

export function requestPasswordReset({ email }) {
  return request("/auth/forgot-password", {
    method: "POST",
    body: { email },
  });
}

export function resetPassword({ token, newPassword }) {
  return request("/auth/reset-password", {
    method: "POST",
    body: { token, new_password: newPassword },
  });
}

export function createTicket({ subject, description }) {
  return request("/tickets", {
    method: "POST",
    auth: true,
    body: { subject, description },
  });
}

export function fetchTickets() {
  return request("/tickets", { auth: true });
}

export function createSubscription({ planName, durationLabel, screens, price }) {
  return request("/subscriptions", {
    method: "POST",
    auth: true,
    body: {
      plan_name: planName,
      duration_label: durationLabel,
      screens,
      price,
    },
  });
}

export function fetchMySubscription() {
  return request("/subscriptions/me", { auth: true });
}

// Full history — active AND past subscriptions, most recent first.
export function fetchSubscriptionHistory() {
  return request("/subscriptions", { auth: true });
}

// Empty until Phase 2 (Razorpay/Stripe checkout) exists.
export function fetchPaymentRecords() {
  return request("/payments", { auth: true });
}

export function fetchTaxConfig() {
  return request("/tax-config");
}

export function fetchExchangeRate() {
  return request("/exchange-rate");
}

export function createStripeCheckoutSession({ planName, durationLabel, screens, rewardPointsRequested }) {
  return request("/payments/stripe/create-checkout-session", {
    method: "POST",
    auth: true,
    body: {
      plan_name: planName,
      duration_label: durationLabel,
      screens,
      reward_points_requested: rewardPointsRequested,
    },
  });
}

export function confirmStripePayment(sessionId) {
  return request("/payments/stripe/confirm", {
    method: "POST",
    auth: true,
    body: { session_id: sessionId },
  });
}

export function fetchBlogs() {
  return request("/blogs");
}

export function fetchBlogPost(id) {
  return request(`/blogs/${id}`, { auth: true }); // auth optional server-side, but needed to populate liked_by_me when logged in
}

export function toggleBlogLike(id) {
  return request(`/blogs/${id}/like`, { method: "POST", auth: true });
}

export function fetchBlogComments(id) {
  return request(`/blogs/${id}/comments`);
}

export function addBlogComment(id, content) {
  return request(`/blogs/${id}/comments`, { method: "POST", auth: true, body: { content } });
}

export function deleteBlogComment(blogId, commentId) {
  return request(`/blogs/${blogId}/comments/${commentId}`, { method: "DELETE", auth: true });
}

export function fetchCommunityRooms() {
  return request("/community/rooms");
}

export function createCommunityRoom(title) {
  return request("/community/rooms", {
    method: "POST",
    auth: true,
    body: { title },
  });
}

export function fetchCommunityRoom(roomId) {
  return request(`/community/rooms/${roomId}`, { auth: true });
}

export async function createRoomPost(roomId, text) {
  const token = getToken();
  const formData = new FormData();
  formData.append("text", text);

  const res = await fetch(`${BASE_URL}/community/rooms/${roomId}/posts`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Couldn't post. Please try again.");
  }
  return data;
}

export function createPostReply(roomId, postId, text) {
  return request(`/community/rooms/${roomId}/posts/${postId}/replies`, {
    method: "POST",
    auth: true,
    body: { text },
  });
}

export function togglePostLike(roomId, postId) {
  return request(`/community/rooms/${roomId}/posts/${postId}/like`, {
    method: "POST",
    auth: true,
  });
}

export function fetchOrganisers() {
  return request("/organisers");
}

export function fetchRevenueRate() {
  return request("/revenue-rate");
}

export function uploadVideo(payload) {
  return request("/videos", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

// fetch() has no way to report upload progress — this is a real browser
// API gap, not something we're working around unnecessarily.
// XMLHttpRequest's upload.onprogress event is the standard, reliable way
// to get real percentage-complete during a large file upload, so this
// one call uses XHR instead of fetch specifically for that reason.
export function uploadVideoFile(videoId, file, onProgress) {
  return new Promise((resolve, reject) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/videos/${videoId}/upload-file`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        reject(new Error(typeof data.detail === "string" ? data.detail : "Couldn't upload video file. Please try again."));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload. Please try again."));

    xhr.send(formData);
  });
}

export function uploadVideoTrailer(videoId, file, onProgress) {
  return new Promise((resolve, reject) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/videos/${videoId}/upload-trailer`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        reject(new Error(typeof data.detail === "string" ? data.detail : "Couldn't upload trailer. Please try again."));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload. Please try again."));

    xhr.send(formData);
  });
}

export async function addVideoSubtitle(videoId, languageCode, languageLabel, file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("language_code", languageCode);
  formData.append("language_label", languageLabel);
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/videos/${videoId}/subtitles`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Couldn't upload subtitle. Please try again.");
  }
  return data;
}

export async function deleteVideoSubtitle(videoId, subtitleId) {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/videos/${videoId}/subtitles/${subtitleId}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Couldn't delete subtitle. Please try again.");
  }
  return data;
}

export async function uploadVideoPoster(videoId, file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/videos/${videoId}/upload-poster`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Couldn't upload poster. Please try again.");
  }
  return data;
}

export function fetchMyVideos() {
  return request("/videos/mine", { auth: true });
}

export function fetchPublishedVideos(section) {
  return request(`/videos${section ? `?section=${section}` : ""}`, { auth: true });
}

export function fetchVideoById(videoId) {
  // auth: true only adds the Authorization header if a token exists —
  // logged-out viewers still get the video (poster/synopsis/cast), just
  // with has_access: false. This is what lets the backend tell a real
  // subscriber apart from someone who's merely logged in, so the player
  // can gate on actual subscription status, not just login state.
  return request(`/videos/${videoId}`, { auth: true });
}

// Pay-Per-Video checkout (Razorpay, India only) — mirrors
// createRazorpayOrder/verifyRazorpayPayment above but for a single
// video purchase instead of a subscription.
export function createVideoPurchaseOrder(videoId) {
  return request(`/videos/${videoId}/purchase/razorpay/create-order`, {
    method: "POST",
    auth: true,
  });
}

export function verifyVideoPurchasePayment({ purchaseId, razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  return request(`/videos/purchase/razorpay/verify`, {
    method: "POST",
    auth: true,
    body: {
      purchase_id: purchaseId,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    },
  });
}

// Pay-Per-Video purchase history — powers the "Pay-Per-Video" tab next
// to "Subscription & payment history" on the account page.
export function fetchMyVideoPurchases() {
  return request(`/videos/purchases/mine`, { auth: true });
}

// Phase 3 — called periodically by the player while a video is
// actually playing. session_seconds is cumulative WITHIN the current
// continuous play session (resets on replay), never summed across
// separate sessions — see VideoWatchRecord's docstring for why.
// playbackSessionToken (optional) also keeps this device's screens-
// limit slot alive — see fetchPlaybackSessionStart below.
export function sendWatchHeartbeat(videoId, sessionSeconds, playbackSessionToken) {
  return request(`/videos/${videoId}/watch-heartbeat`, {
    method: "POST",
    auth: true,
    body: { session_seconds: sessionSeconds, playback_session_token: playbackSessionToken || null },
  });
}

// "Continue Watching" / History — saves where the viewer left off,
// approximated as wall-clock elapsed time since Play was pressed (same
// honest caveat as the revenue heartbeat; no real player-position API
// available through the Bunny embed). Called on the same interval as
// the revenue heartbeat, piggybacking the existing timer rather than
// adding a second one.
export function saveWatchProgress(videoId, positionSeconds) {
  return request(`/videos/${videoId}/progress`, {
    method: "POST",
    auth: true,
    body: { position_seconds: positionSeconds },
  });
}

export function fetchContinueWatching() {
  return request(`/videos/continue-watching/mine`, { auth: true });
}

export function fetchWatchHistory() {
  return request(`/videos/history/mine`, { auth: true });
}

// Screens-limit enforcement — one stable token per browser (see
// getPlaybackSessionToken below), checked/registered right before
// playback actually starts. allowed:false means this device would
// exceed the plan's screens count; the player should show `reason`
// instead of playing.
export function startPlaybackSession(videoId, sessionToken) {
  return request(`/videos/${videoId}/playback-session/start`, {
    method: "POST",
    auth: true,
    body: { session_token: sessionToken },
  });
}

export function endPlaybackSession(sessionToken) {
  return request(`/videos/playback-session/end`, {
    method: "POST",
    auth: true,
    body: { session_token: sessionToken },
  });
}

const PLAYBACK_SESSION_KEY = "theomy_playback_session_token";

// One stable id per browser — generated once, reused for every video
// this browser ever plays, so the backend can tell "this device is
// still watching" apart from "a different device started watching".
export function getPlaybackSessionToken() {
  let token = localStorage.getItem(PLAYBACK_SESSION_KEY);
  if (!token) {
    token = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    localStorage.setItem(PLAYBACK_SESSION_KEY, token);
  }
  return token;
}

// Creator-facing "Content performance analytics" — per-video viewers,
// watch minutes, and revenue for videos the current user uploaded.
export function fetchMyContentPerformance() {
  return request(`/videos/content-performance/mine`, { auth: true });
}

// Creator-facing Analytics — real event-log-backed revenue trend and
// viewer-by-country breakdown, scoped to this creator's own content
// (same data shape as the admin panel's platform-wide version).
export function fetchMyRevenueByDay(days = 30) {
  return request(`/videos/revenue/by-day/mine?days=${days}`, { auth: true });
}

export function fetchMyRevenueByCountry() {
  return request(`/videos/revenue/by-country/mine`, { auth: true });
}

// Real, backend-persisted My List — replaces the old in-memory-only
// implementation that vanished on refresh/logout. Works uniformly for
// real videos and demo cards alike (see MyListItem's model docstring).
export function fetchMyList() {
  return request(`/my-list`, { auth: true });
}

export function toggleMyListItem({ id, title, image, meta, section }) {
  return request(`/my-list/toggle`, {
    method: "POST",
    auth: true,
    body: { item_id: id, title, image_url: image || null, meta: meta || null, section: section || null },
  });
}

export function removeMyListItem(itemId) {
  return request(`/my-list/${itemId}`, { method: "DELETE", auth: true });
}

// Real like toggle for a video — replaces the previously decorative
// thumbs-up button.
export function toggleVideoLike(videoId) {
  return request(`/videos/${videoId}/like/toggle`, { method: "POST", auth: true });
}

export function fetchPerson(personId) {
  return request(`/people/${personId}`);
}

export async function uploadPersonPhoto(personId, file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/people/${personId}/upload-photo`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Couldn't upload photo. Please try again.");
  }
  return data;
}

export function fetchRevenueSummary() {
  return request("/revenue/summary", { auth: true });
}

export function requestWithdrawal(amountRupees) {
  return request("/revenue/withdrawals", {
    method: "POST",
    auth: true,
    body: { amount_rupees: amountRupees },
  });
}

export function fetchWithdrawalHistory() {
  return request("/revenue/withdrawals", { auth: true });
}

export async function submitEventEnquiry(fields, ticketTiers, files) {
  const token = getToken();
  const formData = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      formData.append(key, value);
    }
  });
  formData.append("ticket_tiers", JSON.stringify(ticketTiers));
  (files || []).forEach((file) => formData.append("files", file));

  const res = await fetch(`${BASE_URL}/event-enquiries`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Couldn't submit enquiry. Please try again.");
  }
  return data;
}

export function fetchMyEventEnquiries() {
  return request("/event-enquiries", { auth: true });
}

export async function uploadEventEnquiryPoster(enquiryId, file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${BASE_URL}/event-enquiries/${enquiryId}/upload-poster`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Couldn't upload poster. Please try again.");
  }
  return data;
}

export function fetchApprovedEvents() {
  return request("/event-enquiries/approved");
}

export function fetchPublicEvent(id) {
  return request(`/event-enquiries/${id}/public`);
}

export function createDonationOrder({ organiserUserId, amount }) {
  return request("/donations/razorpay/create-order", {
    method: "POST",
    auth: true,
    body: { organiser_user_id: organiserUserId, amount },
  });
}

export function verifyDonationPayment({ donationId, razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  return request("/donations/razorpay/verify", {
    method: "POST",
    auth: true,
    body: {
      donation_id: donationId,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    },
  });
}

export function createRazorpayOrder({ planName, durationLabel, screens, rewardPointsRequested }) {
  return request("/payments/razorpay/create-order", {
    method: "POST",
    auth: true,
    body: {
      plan_name: planName,
      duration_label: durationLabel,
      screens,
      reward_points_requested: rewardPointsRequested,
    },
  });
}

export function verifyRazorpayPayment({ paymentId, razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  return request("/payments/razorpay/verify", {
    method: "POST",
    auth: true,
    body: {
      payment_id: paymentId,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    },
  });
}

// Public, no auth — used to build the nav (top-level items + Category
// dropdown) from the database instead of a hardcoded array.
export function fetchMenus() {
  return request("/menus");
}

// The live category list — sourced from the same public Menu table
// TopNav.jsx already uses for the site's Category dropdown, so this is
// literally the same data, not a second source of truth. Used
// everywhere a category picker/checkbox list needs to reflect whatever
// an admin has configured under Admin > Categories, without a redeploy.
export async function fetchCategoryOptions() {
  const menus = await fetchMenus();
  const parent = menus.find((m) => m.label === "Category" && !m.parent_menu_id);
  if (!parent) return [];
  return menus
    .filter((m) => m.parent_menu_id === parent.id)
    .sort((a, b) => a.display_order - b.display_order)
    .map((m) => m.category_param || m.label);
}

// AI recommendations — "More like this" (content similarity via
// Voyage AI embeddings) and "Recommended for you" (personalized,
// blends content similarity with real watch/like history + a
// popularity fallback for viewers with no history yet).
export function fetchMoreLikeThis(videoId) {
  return request(`/videos/${videoId}/recommendations`, { auth: true });
}

export function fetchRecommendedForMe() {
  return request(`/videos/recommendations/for-me`, { auth: true });
}

// Public, no auth — the plan catalog (Play/Archive/Both pricing, features)
// from the database instead of a hardcoded array.
export function fetchSubscriptionPlans() {
  return request("/subscription-plans");
}

// Full-page redirects — these aren't fetch calls, the browser needs to
// actually navigate so Google/Facebook's login screen can load.
export function redirectToGoogleLogin() {
  window.location.href = `${BASE_URL}/auth/google/login`;
}

export function redirectToFacebookLogin() {
  window.location.href = `${BASE_URL}/auth/facebook/login`;
}

// Real search — title, description, category, cast, and crew name.
// Plain SQL text matching, not AI — see routers/videos.py's
// search_videos for why a name search shouldn't be semantic.
export function searchVideos(q, section) {
  const params = new URLSearchParams({ q });
  if (section) params.set("section", section);
  return request(`/videos/search?${params.toString()}`, { auth: true });
}

// Live streaming — creator/organiser side (requires can_live_stream)
// and public viewing side. See routers/live_streams.py.
export function createMyLiveStream(title, description, section) {
  return request(`/videos/live`, {
    method: "POST",
    auth: true,
    body: { title, description: description || null, section },
  });
}

export function fetchMyLiveStreams() {
  return request(`/videos/live/mine`, { auth: true });
}

export function endMyLiveStream(liveStreamId) {
  return request(`/videos/live/${liveStreamId}/end`, { method: "POST", auth: true });
}

// TEMPORARY / TEST-ONLY — flips a stream to "active" without any real
// broadcast, purely for previewing the Live Now UI. Remove once real
// Mux end-to-end broadcasting has been tested.
export function simulateStartMyLiveStream(liveStreamId) {
  return request(`/videos/live/${liveStreamId}/simulate-start`, { method: "POST", auth: true });
}

export function deleteMyLiveStream(liveStreamId) {
  return request(`/videos/live/${liveStreamId}`, { method: "DELETE", auth: true });
}

// Public — currently-active live streams. auth:true attaches the
// token only when one exists, same pattern as fetchVideoById: a
// logged-out visitor still sees the list, just without a playback_url.
export function fetchActiveLiveStreams(section) {
  return request(`/videos/live${section ? `?section=${section}` : ""}`, { auth: true });
}

export function fetchSpecialCategories(section) {
  return request(`/special-categories?section=${section}`, { auth: true });
}

export function fetchLiveStream(liveStreamId) {
  return request(`/videos/live/${liveStreamId}`, { auth: true });
}
