// src/admin/adminApi.js
//
// Deliberately separate from src/api.js — uses its own token storage key
// so an admin session never collides with a regular consumer session in
// the same browser (e.g. testing as both a customer and an admin at once
// in different tabs).

const BASE_URL = "/api";
const ADMIN_TOKEN_KEY = "theomy_admin_token";

export function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token) {
  if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getAdminToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Something went wrong. Please try again.");
  }
  return data;
}

export function adminLogin(email, password) {
  return request("/admin/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export function fetchCurrentAdmin() {
  return request("/admin/auth/me", { auth: true });
}

export function fetchAdminList() {
  return request("/admin/auth/admins", { auth: true });
}

export function createAdminAccount({ name, email, password, role }) {
  return request("/admin/auth/admins", {
    method: "POST",
    auth: true,
    body: { name, email, password, role },
  });
}

export function deactivateAdminAccount(adminId) {
  return request(`/admin/auth/admins/${adminId}`, {
    method: "DELETE",
    auth: true,
  });
}

export function fetchAdminVideos(statusFilter = "pending") {
  return request(`/admin/videos?status_filter=${statusFilter}`, { auth: true });
}

export function approveVideo(videoId) {
  return request(`/admin/videos/${videoId}/approve`, {
    method: "POST",
    auth: true,
  });
}

export function rejectVideo(videoId, adminNote) {
  return request(`/admin/videos/${videoId}/reject`, {
    method: "POST",
    auth: true,
    body: { admin_note: adminNote },
  });
}

export function disableVideo(videoId) {
  return request(`/admin/videos/${videoId}/disable`, { method: "POST", auth: true });
}

export function enableVideo(videoId) {
  return request(`/admin/videos/${videoId}/enable`, { method: "POST", auth: true });
}

export function fetchAdminEnquiries(statusFilter = "pending") {
  return request(`/admin/event-enquiries?status_filter=${statusFilter}`, { auth: true });
}

export function approveEnquiry(enquiryId) {
  return request(`/admin/event-enquiries/${enquiryId}/approve`, { method: "POST", auth: true });
}

export function rejectEnquiry(enquiryId, adminNote) {
  return request(`/admin/event-enquiries/${enquiryId}/reject`, {
    method: "POST", auth: true, body: { admin_note: adminNote },
  });
}

export function editEnquiry(enquiryId, payload) {
  return request(`/admin/event-enquiries/${enquiryId}`, { method: "PUT", auth: true, body: payload });
}

export async function deleteEnquiry(enquiryId) {
  const token = getAdminToken();
  const res = await fetch(`${BASE_URL}/admin/event-enquiries/${enquiryId}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data.detail === "string" ? data.detail : "Couldn't delete this enquiry.");
  }
}
export function editVideo(videoId, payload) {
  return request(`/admin/videos/${videoId}`, {
    method: "PUT",
    auth: true,
    body: payload,
  });
}

export async function deleteVideo(videoId) {
  const token = getAdminToken();
  const res = await fetch(`${BASE_URL}/admin/videos/${videoId}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data.detail === "string" ? data.detail : "Couldn't delete this video.");
  }
}

export async function uploadAdminPersonPhoto(personId, file) {
  const token = getAdminToken();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${BASE_URL}/admin/videos/people/${personId}/upload-photo`, {
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

export function createAdminVideo(payload) {
  return request("/admin/videos", {
    method: "POST",
    auth: true,
    body: payload,
  });
}

export function searchCreatorAccounts(search = "") {
  const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  return request(`/admin/videos/creators${query}`, { auth: true });
}

export function uploadAdminVideoFile(videoId, file, onProgress) {
  return new Promise((resolve, reject) => {
    const token = getAdminToken();
    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/admin/videos/${videoId}/upload-file`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(typeof data.detail === "string" ? data.detail : "Couldn't upload video file."));
    };
    xhr.onerror = () => reject(new Error("Network error during upload. Please try again."));
    xhr.send(formData);
  });
}

export async function uploadAdminVideoPoster(videoId, file) {
  const token = getAdminToken();
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/admin/videos/${videoId}/upload-poster`, {
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

// Revenue Sharing Management — withdrawal request review + payment
// tracking, and platform-wide content performance analytics.
export function fetchAdminWithdrawals(statusFilter) {
  return request(`/admin/revenue/withdrawals${statusFilter ? `?status_filter=${statusFilter}` : ""}`, { auth: true });
}

export function approveWithdrawal(withdrawalId, adminNote) {
  return request(`/admin/revenue/withdrawals/${withdrawalId}/approve`, {
    method: "POST",
    auth: true,
    body: { admin_note: adminNote || null },
  });
}

export function markWithdrawalPaid(withdrawalId, adminNote) {
  return request(`/admin/revenue/withdrawals/${withdrawalId}/mark-paid`, {
    method: "POST",
    auth: true,
    body: { admin_note: adminNote || null },
  });
}

export function rejectWithdrawal(withdrawalId, adminNote) {
  return request(`/admin/revenue/withdrawals/${withdrawalId}/reject`, {
    method: "POST",
    auth: true,
    body: { admin_note: adminNote },
  });
}

export function fetchAdminContentPerformance() {
  return request(`/admin/revenue/content-performance`, { auth: true });
}

// Category management — powers the Admin > Categories page. Every
// change here immediately affects the public Category nav dropdown
// (via GET /menus, already dynamic) AND the video upload form's
// category checkboxes (via /videos.py's live ALLOWED_CATEGORIES query).
export function fetchAdminCategories() {
  return request(`/admin/categories`, { auth: true });
}

// Ad library (VAST tags, Google Ad Manager / third-party) + per-video
// cue point management. Powers the Admin > Ads page and the "Has Ads"
// section in the video upload/edit forms.
export function fetchAdminAds() {
  return request(`/admin/ads`, { auth: true });
}

export function createAdminAd(name, vastTagUrl) {
  return request(`/admin/ads`, {
    method: "POST",
    auth: true,
    body: { name, vast_tag_url: vastTagUrl },
  });
}

export function updateAdminAd(adId, updates) {
  return request(`/admin/ads/${adId}`, {
    method: "PUT",
    auth: true,
    body: updates,
  });
}

export function deleteAdminAd(adId) {
  return request(`/admin/ads/${adId}`, { method: "DELETE", auth: true });
}

export function fetchAdminVideoCuePoints(videoId) {
  return request(`/admin/ads/videos/${videoId}/cue-points`, { auth: true });
}

export function addAdminVideoCuePoint(videoId, adId, offsetSeconds) {
  return request(`/admin/ads/videos/${videoId}/cue-points`, {
    method: "POST",
    auth: true,
    body: { ad_id: adId, offset_seconds: offsetSeconds },
  });
}

export function deleteAdminVideoCuePoint(videoId, cuePointId) {
  return request(`/admin/ads/videos/${videoId}/cue-points/${cuePointId}`, {
    method: "DELETE",
    auth: true,
  });
}

export function createAdminCategory(label) {
  return request(`/admin/categories`, {
    method: "POST",
    auth: true,
    body: { label },
  });
}

export function updateAdminCategory(categoryId, updates) {
  return request(`/admin/categories/${categoryId}`, {
    method: "PUT",
    auth: true,
    body: updates,
  });
}

export function deleteAdminCategory(categoryId) {
  return request(`/admin/categories/${categoryId}`, {
    method: "DELETE",
    auth: true,
  });
}

// Revenue Summary (platform-wide KPIs) + Revenue Share Report (per creator).
export function fetchAdminRevenueSummary() {
  return request(`/admin/revenue/summary`, { auth: true });
}

export function fetchAdminRevenueByCreator() {
  return request(`/admin/revenue/by-creator`, { auth: true });
}

// Platform default rate + commission — superadmin-only editing.
export function fetchAdminRevenueConfig() {
  return request(`/admin/revenue/config`, { auth: true });
}

export function updateAdminRevenueConfig({ ratePaisaPerMinute, platformCommissionPercent }) {
  return request(`/admin/revenue/config`, {
    method: "PUT",
    auth: true,
    body: {
      rate_paisa_per_minute: ratePaisaPerMinute,
      platform_commission_percent: platformCommissionPercent,
    },
  });
}

// Revenue analytics — real data from RevenueLedgerEntry, not estimates.
export function fetchRevenueByDay(days = 30) {
  return request(`/admin/revenue/analytics/by-day?days=${days}`, { auth: true });
}

export function fetchRevenueByCountry() {
  return request(`/admin/revenue/analytics/by-country`, { auth: true });
}

// AI content optimization — Claude-powered title/description/category
// suggestions at upload time, and a plain-language read of the
// Analytics numbers on the Revenue page.
export function suggestVideoMetadata(title, description) {
  return request(`/admin/ai/suggest-metadata`, {
    method: "POST",
    auth: true,
    body: { title, description },
  });
}

export function fetchAnalyticsInsights(force = false) {
  return request(`/admin/ai/analytics-insights${force ? "?force=true" : ""}`, { auth: true });
}

// AI config — the AI Insights cache-duration setting, admin-editable
// instead of a hardcoded value.
export function fetchAIConfig() {
  return request(`/admin/ai/config`, { auth: true });
}

export function updateAIConfig(insightCacheHours) {
  return request(`/admin/ai/config`, {
    method: "PUT",
    auth: true,
    body: { insight_cache_hours: insightCacheHours },
  });
}

// User Management — regular platform accounts (User/Content Creator/
// Plays Organiser), separate from Admin Accounts.
export function fetchAdminUsers(search) {
  return request(`/admin/users${search ? `?search=${encodeURIComponent(search)}` : ""}`, { auth: true });
}

export function setUserPassword(userId, newPassword) {
  return request(`/admin/users/${userId}/password`, {
    method: "PUT",
    auth: true,
    body: { new_password: newPassword },
  });
}

export function setUserLiveStreaming(userId, enabled) {
  return request(`/admin/users/${userId}/live-streaming`, {
    method: "PUT",
    auth: true,
    body: { enabled },
  });
}

export function setUserActive(userId, enabled) {
  return request(`/admin/users/${userId}/active`, {
    method: "PUT",
    auth: true,
    body: { enabled },
  });
}

// Live Streaming (admin side) — create as admin, list all (any status),
// end/delete any stream.
export function createAdminLiveStream(title, description, section) {
  return request(`/admin/videos/live`, {
    method: "POST",
    auth: true,
    body: { title, description: description || null, section },
  });
}

export function fetchAdminLiveStreams() {
  return request(`/admin/videos/live`, { auth: true });
}

export function endAdminLiveStream(liveStreamId) {
  return request(`/admin/videos/live/${liveStreamId}/end`, { method: "POST", auth: true });
}

export function deleteAdminLiveStream(liveStreamId) {
  return request(`/admin/videos/live/${liveStreamId}`, { method: "DELETE", auth: true });
}
