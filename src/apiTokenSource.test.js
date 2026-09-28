// Inside /admin the three organiser pages send the ADMIN token through the
// site's api.js; everywhere else api.js must keep using the site token.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as api from "./api";
import "./admin/OrganiserSitePages"; // registers the token source, exactly as the app does

const SITE = "site-token";
const ADMIN = "admin-token";

function mockFetch(status = 200, body = []) {
  const fn = vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const authHeader = (fn) => fn.mock.calls[0][1].headers.Authorization;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("theomy_token", SITE);
  localStorage.setItem("theomy_admin_token", ADMIN);
  window.history.pushState({}, "", "/");
});
afterEach(() => vi.unstubAllGlobals());

describe("getToken", () => {
  it("is the site token on the main site (site unaffected)", () => {
    expect(api.getToken()).toBe(SITE);
    window.history.pushState({}, "", "/blog/abc");
    expect(api.getToken()).toBe(SITE);
  });

  it("is the admin token under /admin", () => {
    window.history.pushState({}, "", "/admin");
    expect(api.getToken()).toBe(ADMIN);
  });

  it("never falls back to the site token under /admin when the admin is logged out", () => {
    window.history.pushState({}, "", "/admin");
    localStorage.removeItem("theomy_admin_token");
    expect(api.getToken()).toBeNull();
  });
});

describe("requests", () => {
  it("request()-based calls send the admin token under /admin and the site token elsewhere", async () => {
    let f = mockFetch();
    window.history.pushState({}, "", "/admin");
    await api.fetchMyVideos();
    expect(authHeader(f)).toBe(`Bearer ${ADMIN}`);

    f = mockFetch();
    window.history.pushState({}, "", "/");
    await api.fetchMyVideos();
    expect(authHeader(f)).toBe(`Bearer ${SITE}`);
  });

  it("direct-fetch uploads (poster) use the same override", async () => {
    const f = mockFetch(200, {});
    window.history.pushState({}, "", "/admin");
    await api.uploadVideoPoster("v1", new File(["x"], "p.png", { type: "image/png" }));
    expect(f.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${ADMIN}`);
  });

  it("a 401 while using the admin token does NOT wipe the site login or announce a session end", async () => {
    mockFetch(401, { detail: "Invalid or expired token" });
    const ended = vi.fn();
    window.addEventListener("auth:sessionEnded", ended);
    window.history.pushState({}, "", "/admin");
    await expect(api.fetchMyVideos()).rejects.toThrow("Invalid or expired token");
    window.removeEventListener("auth:sessionEnded", ended);
    expect(localStorage.getItem("theomy_token")).toBe(SITE);
    expect(ended).not.toHaveBeenCalled();
  });

  it("a 401 on the main site still ends the session as before", async () => {
    mockFetch(401, { detail: "Invalid or expired token" });
    const ended = vi.fn();
    window.addEventListener("auth:sessionEnded", ended);
    await expect(api.fetchMyVideos()).rejects.toThrow();
    window.removeEventListener("auth:sessionEnded", ended);
    expect(localStorage.getItem("theomy_token")).toBeNull();
    expect(ended).toHaveBeenCalledTimes(1);
  });
});
