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
