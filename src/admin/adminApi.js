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
