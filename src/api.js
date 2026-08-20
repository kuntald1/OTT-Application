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

export function registerUser({ name, email, password, phone, role }) {
  return request("/auth/register", {
    method: "POST",
    body: { name, email, password, phone: phone || null, role },
  });
}

export function loginUser({ email, password }) {
  return request("/auth/login", {
    method: "POST",
    body: { email, password },
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

export function fetchBlogs() {
  return request("/blogs");
}

export function fetchBlogPost(id) {
  return request(`/blogs/${id}`);
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
