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

export async function uploadAdminEventEnquiryPoster(enquiryId, file) {
  const token = getAdminToken();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${BASE_URL}/admin/event-enquiries/${enquiryId}/upload-poster`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Couldn't upload poster.");
  }
  return data;
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

export function uploadAdminVideoTrailer(videoId, file, onProgress) {
  return new Promise((resolve, reject) => {
    const token = getAdminToken();
    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/admin/videos/${videoId}/upload-trailer`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(typeof data.detail === "string" ? data.detail : "Couldn't upload trailer."));
    };
    xhr.onerror = () => reject(new Error("Network error during upload. Please try again."));
    xhr.send(formData);
  });
}

export async function addAdminVideoSubtitle(videoId, languageCode, languageLabel, file) {
  const token = getAdminToken();
  const formData = new FormData();
  formData.append("language_code", languageCode);
  formData.append("language_label", languageLabel);
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/admin/videos/${videoId}/subtitles`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Couldn't upload subtitle.");
  }
  return data;
}

export async function deleteAdminVideoSubtitle(videoId, subtitleId) {
  const token = getAdminToken();
  const res = await fetch(`${BASE_URL}/admin/videos/${videoId}/subtitles/${subtitleId}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Couldn't delete subtitle.");
  }
  return data;
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

// Shared by every Revenue Sharing Management fetch below — builds the
// ?start_date=&end_date= query string the backend's app/date_range.py
// expects (both optional; the backend itself defaults to the last 1
// month when omitted, but pages always pass an explicit range once
// DateRangePicker has mounted).
function _dateRangeQuery({ startDate, endDate } = {}) {
  const params = new URLSearchParams();
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  return params.toString();
}

// Revenue Sharing Management — withdrawal request review + payment
// tracking, and platform-wide content performance analytics. All-time
// (deliberately not date-range scoped, unlike Dashboard/Reports).
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

export function notifyUserLiveStreaming(userId) {
  return request(`/admin/users/${userId}/notify-live-streaming`, { method: "POST", auth: true });
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

export function updateAdminLiveStream(liveStreamId, updates) {
  return request(`/admin/videos/live/${liveStreamId}`, {
    method: "PUT",
    auth: true,
    body: updates,
  });
}

export function endAdminLiveStream(liveStreamId) {
  return request(`/admin/videos/live/${liveStreamId}/end`, { method: "POST", auth: true });
}

// TEMPORARY / TEST-ONLY — flips a stream to "active" without any real
// broadcast, purely for previewing the Live Now UI. Remove once real
// Mux end-to-end broadcasting has been tested.
export function simulateStartAdminLiveStream(liveStreamId) {
  return request(`/admin/videos/live/${liveStreamId}/simulate-start`, { method: "POST", auth: true });
}

export function deleteAdminLiveStream(liveStreamId) {
  return request(`/admin/videos/live/${liveStreamId}`, { method: "DELETE", auth: true });
}

// --- Special Categories (admin-curated featured rows) ---

export function createAdminSpecialCategory(title, visibleFrom, visibleTo, section) {
  return request(`/admin/special-categories`, {
    method: "POST",
    auth: true,
    body: { title, visible_from: visibleFrom, visible_to: visibleTo, section },
  });
}

export function fetchAdminSpecialCategories() {
  return request(`/admin/special-categories`, { auth: true });
}

export function updateAdminSpecialCategory(id, updates) {
  return request(`/admin/special-categories/${id}`, { method: "PUT", auth: true, body: updates });
}

export function toggleAdminSpecialCategoryDisabled(id) {
  return request(`/admin/special-categories/${id}/disable`, { method: "PUT", auth: true });
}

export function deleteAdminSpecialCategory(id) {
  return request(`/admin/special-categories/${id}`, { method: "DELETE", auth: true });
}

export function addVideoToAdminSpecialCategory(id, videoId) {
  return request(`/admin/special-categories/${id}/videos?video_id=${videoId}`, { method: "POST", auth: true });
}

export function removeVideoFromAdminSpecialCategory(id, videoId) {
  return request(`/admin/special-categories/${id}/videos/${videoId}`, { method: "DELETE", auth: true });
}

// --- Blog management ---

export function createAdminBlog(title, excerpt, body, authorName, isPublished) {
  return request(`/admin/blogs`, {
    method: "POST",
    auth: true,
    body: { title, excerpt, body, author_name: authorName || "theomy Team", is_published: isPublished },
  });
}

export function fetchAdminBlogs() {
  return request(`/admin/blogs`, { auth: true });
}

export function updateAdminBlog(id, updates) {
  return request(`/admin/blogs/${id}`, { method: "PUT", auth: true, body: updates });
}

export function deleteAdminBlog(id) {
  return request(`/admin/blogs/${id}`, { method: "DELETE", auth: true });
}

export async function uploadAdminBlogCover(id, file) {
  const token = getAdminToken();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${BASE_URL}/admin/blogs/${id}/upload-cover`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Couldn't upload cover image.");
  }
  return data;
}

export function fetchAllAdminBlogComments() {
  return request(`/admin/blogs/comments/all`, { auth: true });
}

export function editAdminBlogComment(commentId, content) {
  return request(`/admin/blogs/comments/${commentId}`, { method: "PUT", auth: true, body: { content } });
}

export function deleteAdminBlogComment(commentId) {
  return request(`/admin/blogs/comments/${commentId}`, { method: "DELETE", auth: true });
}

export function toggleAdminBlogLike(blogId) {
  return request(`/admin/blogs/${blogId}/like`, { method: "POST", auth: true });
}

export function addAdminBlogComment(blogId, content) {
  return request(`/admin/blogs/${blogId}/comments`, { method: "POST", auth: true, body: { content } });
}

// --- Cast/Crew Master (Person profiles) ---

export function searchAdminPeople(q) {
  return request(`/admin/people${q ? `?q=${encodeURIComponent(q)}` : ""}`, { auth: true });
}

export function createAdminPerson(payload) {
  return request(`/admin/people`, { method: "POST", auth: true, body: payload });
}

export function updateAdminPerson(personId, payload) {
  return request(`/admin/people/${personId}`, { method: "PUT", auth: true, body: payload });
}

export async function deleteAdminPerson(personId) {
  const token = getAdminToken();
  const res = await fetch(`${BASE_URL}/admin/people/${personId}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data.detail === "string" ? data.detail : "Couldn't delete this person — they may still be credited on a video.");
  }
}

// --- Organiser Requests ---

export function fetchAdminOrganiserRequests(statusFilter = "") {
  return request(`/admin/organiser-requests${statusFilter ? `?status_filter=${statusFilter}` : ""}`, { auth: true });
}

export function approveOrganiserRequest(requestId) {
  return request(`/admin/organiser-requests/${requestId}/approve`, { method: "POST", auth: true });
}

export function rejectOrganiserRequest(requestId, reason) {
  return request(`/admin/organiser-requests/${requestId}/reject`, { method: "POST", auth: true, body: { reason: reason || null } });
}

// --- Community Rooms ---

export function createAdminCommunityRoom(title) {
  return request(`/admin/community/rooms`, { method: "POST", auth: true, body: { title } });
}

export async function createAdminRoomPost(roomId, text, imageFile) {
  const token = getAdminToken();
  const formData = new FormData();
  formData.append("text", text);
  if (imageFile) formData.append("image", imageFile);
  const res = await fetch(`${BASE_URL}/admin/community/rooms/${roomId}/posts`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Couldn't post comment.");
  }
  return data;
}

export async function deleteAdminRoomPost(roomId, postId) {
  const token = getAdminToken();
  const res = await fetch(`${BASE_URL}/admin/community/rooms/${roomId}/posts/${postId}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data.detail === "string" ? data.detail : "Couldn't delete comment.");
  }
}

export async function deleteAdminCommunityRoom(roomId) {
  const token = getAdminToken();
  const res = await fetch(`${BASE_URL}/admin/community/rooms/${roomId}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data.detail === "string" ? data.detail : "Couldn't delete room.");
  }
}

// --- Donation Registrations ---

export function fetchAdminDonationRegistrations(statusFilter = "") {
  return request(`/admin/donation-registrations${statusFilter ? `?status_filter=${statusFilter}` : ""}`, { auth: true });
}

export async function createAdminDonationRegistration({ userId, groupName, accountNumber, ifscCode, qrCodeFile, documentFile }) {
  const token = getAdminToken();
  const formData = new FormData();
  formData.append("user_id", userId);
  formData.append("group_name", groupName);
  formData.append("account_number", accountNumber || "");
  formData.append("ifsc_code", ifscCode || "");
  if (qrCodeFile) formData.append("qr_code", qrCodeFile);
  formData.append("document", documentFile);
  const res = await fetch(`${BASE_URL}/admin/donation-registrations`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Couldn't create registration.");
  }
  return data;
}

export function approveDonationRegistration(requestId) {
  return request(`/admin/donation-registrations/${requestId}/approve`, { method: "POST", auth: true });
}

export function rejectDonationRegistration(requestId, reason) {
  return request(`/admin/donation-registrations/${requestId}/reject`, { method: "POST", auth: true, body: { reason } });
}

export function disableDonationRegistration(requestId) {
  return request(`/admin/donation-registrations/${requestId}/disable`, { method: "POST", auth: true });
}

export async function deleteAdminDonationRegistration(requestId) {
  const token = getAdminToken();
  const res = await fetch(`${BASE_URL}/admin/donation-registrations/${requestId}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(typeof data.detail === "string" ? data.detail : "Couldn't delete registration.");
  }
}

// --- Subscription Plan Management ---

export function fetchAdminSubscriptionPlans() {
  return request("/admin/subscription-plans", { auth: true });
}

export function createAdminSubscriptionPlan(payload) {
  return request("/admin/subscription-plans", { method: "POST", auth: true, body: payload });
}

export function updateAdminSubscriptionPlan(planId, payload) {
  return request(`/admin/subscription-plans/${planId}`, { method: "PUT", auth: true, body: payload });
}

export function toggleAdminSubscriptionPlan(planId) {
  return request(`/admin/subscription-plans/${planId}/toggle`, { method: "PATCH", auth: true });
}

export function fetchAdminSubscriptionDurations() {
  return request("/admin/subscription-plans/durations", { auth: true });
}

export function createAdminSubscriptionDuration(payload) {
  return request("/admin/subscription-plans/durations", { method: "POST", auth: true, body: payload });
}

export function updateAdminSubscriptionDuration(durationId, payload) {
  return request(`/admin/subscription-plans/durations/${durationId}`, { method: "PUT", auth: true, body: payload });
}

export function toggleAdminSubscriptionDuration(durationId) {
  return request(`/admin/subscription-plans/durations/${durationId}/toggle`, { method: "PATCH", auth: true });
}

export function fetchAdminTaxConfig() {
  return request("/admin/subscription-plans/tax", { auth: true });
}

export function updateAdminTaxConfig(gstPercent) {
  return request("/admin/subscription-plans/tax", { method: "PUT", auth: true, body: { gst_percent: gstPercent } });
}

// --- Customer Management (subscriptions/payments drill-down) ---

export function fetchAdminUserSubscriptions(userId) {
  return request(`/admin/users/${userId}/subscriptions`, { auth: true });
}

export function fetchAdminUserPayments(userId) {
  return request(`/admin/users/${userId}/payments`, { auth: true });
}

// --- Subscription Management ---

export function fetchAdminSubscriptionTransactions({ statusFilter, search } = {}) {
  const params = new URLSearchParams();
  if (statusFilter && statusFilter !== "all") params.set("status_filter", statusFilter);
  if (search) params.set("search", search);
  const qs = params.toString();
  return request(`/admin/subscriptions${qs ? `?${qs}` : ""}`, { auth: true });
}

// --- Help Center (tickets: Message + Complain) ---

export function fetchAdminTickets({ source, statusFilter } = {}) {
  const params = new URLSearchParams();
  if (source) params.set("source", source);
  if (statusFilter) params.set("status_filter", statusFilter);
  const qs = params.toString();
  return request(`/admin/tickets${qs ? `?${qs}` : ""}`, { auth: true });
}

export function updateAdminTicketStatus(ticketId, statusValue) {
  return request(`/admin/tickets/${ticketId}/status`, { method: "PUT", auth: true, body: { status: statusValue } });
}

// --- Dashboard ---

export function fetchAdminDashboardSummary(dateRange) {
  const qs = _dateRangeQuery(dateRange);
  return request(`/admin/dashboard/summary${qs ? `?${qs}` : ""}`, { auth: true });
}

// --- Reports and Analytics ---

export function fetchAdminReport(reportType, dateRange) {
  const qs = _dateRangeQuery(dateRange);
  return request(`/admin/reports/${reportType}${qs ? `?${qs}` : ""}`, { auth: true });
}

export async function downloadAdminReportCsv(reportType, dateRange) {
  const token = getAdminToken();
  const qs = _dateRangeQuery(dateRange);
  const res = await fetch(`${BASE_URL}/admin/reports/${reportType}/export${qs ? `?${qs}` : ""}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error("Couldn't export the report. Please try again.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${reportType}_report.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// --- Page Heroes (Plays/Archive/Community/Ticketing banner) ---

export function fetchAdminPageHeroes() {
  return request("/admin/page-heroes", { auth: true });
}

export async function updateAdminPageHeroDetails(pageKey, { contentType, eyebrow, headline, subtext }) {
  const token = getAdminToken();
  const formData = new FormData();
  formData.append("content_type", contentType);
  formData.append("eyebrow", eyebrow || "");
  formData.append("headline", headline);
  formData.append("subtext", subtext || "");
  const res = await fetch(`${BASE_URL}/admin/page-heroes/${pageKey}`, {
    method: "PUT",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "Couldn't save the hero. Please try again.");
  }
  return data;
}

// files: a FileList or array of File objects — uploads all of them to
// this hero's slideshow in one request. Uses XMLHttpRequest (not
// fetch, which has no upload-progress event) so onProgress can drive
// a real progress bar — video files are large enough that "Uploading…"
// with no percentage looks stuck even when it's working fine.
export function addAdminPageHeroMedia(pageKey, files, onProgress) {
  const token = getAdminToken();
  const formData = new FormData();
  Array.from(files).forEach((f) => formData.append("files", f));

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/admin/page-heroes/${pageKey}/media`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON error body */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        reject(new Error(typeof data.detail === "string" ? data.detail : "Couldn't upload. Please try again."));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection and try again."));

    xhr.send(formData);
  });
}

export function deleteAdminPageHeroMedia(pageKey, mediaId) {
  return request(`/admin/page-heroes/${pageKey}/media/${mediaId}`, { method: "DELETE", auth: true });
}

// --- Theater Hero Slides (TheaterHero.jsx carousel) ---

export function fetchAdminTheaterHeroSlides() {
  return request("/admin/theater-hero-slides", { auth: true });
}

export function createAdminTheaterHeroSlide(imageFile, { category, venue, title, synopsis }, onProgress) {
  const token = getAdminToken();
  const formData = new FormData();
  formData.append("image", imageFile);
  formData.append("category", category || "");
  formData.append("venue", venue || "");
  formData.append("title", title);
  formData.append("synopsis", synopsis || "");

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/admin/theater-hero-slides`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON error body */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(typeof data.detail === "string" ? data.detail : "Couldn't upload. Please try again."));
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection and try again."));
    xhr.send(formData);
  });
}

export function updateAdminTheaterHeroSlideText(slideId, { category, venue, title, synopsis }) {
  return request(`/admin/theater-hero-slides/${slideId}`, {
    method: "PUT", auth: true, body: { category: category || null, venue: venue || null, title, synopsis: synopsis || null },
  });
}

export function deleteAdminTheaterHeroSlide(slideId) {
  return request(`/admin/theater-hero-slides/${slideId}`, { method: "DELETE", auth: true });
}

// --- Archive Hero Slides (ArchiveHero.jsx carousel) ---

export function fetchAdminArchiveHeroSlides() {
  return request("/admin/archive-hero-slides", { auth: true });
}

export function createAdminArchiveHeroSlide(imageFile, { eyebrow, headline, subtext }, onProgress) {
  const token = getAdminToken();
  const formData = new FormData();
  formData.append("image", imageFile);
  formData.append("eyebrow", eyebrow || "");
  formData.append("headline", headline);
  formData.append("subtext", subtext || "");

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/admin/archive-hero-slides`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON error body */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(typeof data.detail === "string" ? data.detail : "Couldn't upload. Please try again."));
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection and try again."));
    xhr.send(formData);
  });
}

export function updateAdminArchiveHeroSlideText(slideId, { eyebrow, headline, subtext }) {
  return request(`/admin/archive-hero-slides/${slideId}`, {
    method: "PUT", auth: true, body: { eyebrow: eyebrow || null, headline, subtext: subtext || null },
  });
}

export function deleteAdminArchiveHeroSlide(slideId) {
  return request(`/admin/archive-hero-slides/${slideId}`, { method: "DELETE", auth: true });
}

// --- Content & Policy Management ---

export function fetchAdminSitePages() {
  return request("/admin/site-pages", { auth: true });
}

export function updateAdminSitePage(slug, { title, content }) {
  return request(`/admin/site-pages/${slug}`, { method: "PUT", auth: true, body: { title, content } });
}

export function fetchAdminFaqs() {
  return request("/admin/faqs", { auth: true });
}

export function createAdminFaq({ question, answer }) {
  return request("/admin/faqs", { method: "POST", auth: true, body: { question, answer } });
}

export function updateAdminFaq(faqId, { question, answer }) {
  return request(`/admin/faqs/${faqId}`, { method: "PUT", auth: true, body: { question, answer } });
}

export function deleteAdminFaq(faqId) {
  return request(`/admin/faqs/${faqId}`, { method: "DELETE", auth: true });
}

// --- Ad Banners ---

export function fetchAdminAdBanners() {
  return request("/admin/ad-banners", { auth: true });
}

export function createAdminAdBanner(imageFile, { redirectUrl, startDate, endDate, pages }, onProgress) {
  const token = getAdminToken();
  const formData = new FormData();
  formData.append("image", imageFile);
  formData.append("redirect_url", redirectUrl);
  formData.append("start_date", startDate);
  formData.append("end_date", endDate);
  formData.append("pages", pages.join(","));

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/admin/ad-banners`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* non-JSON error body */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(typeof data.detail === "string" ? data.detail : "Couldn't upload. Please try again."));
    };
    xhr.onerror = () => reject(new Error("Upload failed — check your connection and try again."));
    xhr.send(formData);
  });
}

export function updateAdminAdBanner(bannerId, { redirectUrl, startDate, endDate, pages }) {
  return request(`/admin/ad-banners/${bannerId}`, {
    method: "PUT", auth: true,
    body: { redirect_url: redirectUrl, start_date: startDate, end_date: endDate, pages },
  });
}

export function toggleAdminAdBanner(bannerId) {
  return request(`/admin/ad-banners/${bannerId}/toggle`, { method: "PATCH", auth: true });
}

export function deleteAdminAdBanner(bannerId) {
  return request(`/admin/ad-banners/${bannerId}`, { method: "DELETE", auth: true });
}

// --- Organiser Profile (admin side — "About Page" for a Plays Organiser) ---

export function fetchAdminOrganiserSections(userId) {
  return request(`/admin/organiser-profile/${userId}/sections`, { auth: true });
}

export function createAdminOrganiserSection(userId, { title, contentHtml }) {
  return request(`/admin/organiser-profile/${userId}/sections`, {
    method: "POST", auth: true, body: { title, content_html: contentHtml },
  });
}

export function updateAdminOrganiserSection(sectionId, { title, contentHtml }) {
  return request(`/admin/organiser-profile/sections/${sectionId}`, {
    method: "PUT", auth: true, body: { title, content_html: contentHtml },
  });
}

export function deleteAdminOrganiserSection(sectionId) {
  return request(`/admin/organiser-profile/sections/${sectionId}`, { method: "DELETE", auth: true });
}
