// Plays Organiser pages inside /admin: sidebar visibility, the "not linked"
// guard, the reused site pages without AppProvider / Back button, and the
// "Give admin access" button in User Management.
import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal();
  const empty = () => vi.fn().mockResolvedValue([]);
  return {
    ...actual,
    fetchMyVideos: empty(),
    fetchCategoryOptions: empty(),
    fetchRevenueSummary: vi.fn().mockResolvedValue({ total_earned_rupees: 0, available_balance_rupees: 0, pending_withdrawals_rupees: 0 }),
    fetchWithdrawalHistory: empty(),
    fetchMyContentPerformance: empty(),
    fetchMyRevenueByDay: empty(),
    fetchMyRevenueByCountry: empty(),
    fetchMyRevenueByCity: empty(),
    fetchMyRevenueByAgeGroup: empty(),
    fetchMyRevenueGeoBreakdown: empty(),
    fetchMyEventEnquiries: empty(),
  };
});
vi.mock("./adminApi", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fetchAdminUsers: vi.fn(), giveOrganiserAdminAccess: vi.fn() };
});
vi.mock("./AdminDashboardPage", () => ({ default: () => <div>dashboard-page</div> }));

import * as api from "../api";
import * as adminApi from "./adminApi";
import { OrganiserAddVideoPage, OrganiserRevenuePage, OrganiserEventListingPage } from "./OrganiserSitePages";
import MyVideoListPage from "../Profile/MyVideoListPage";
import AdminLayout from "./AdminLayout";
import AdminUsersPage from "./AdminUsersPage";

const ALL = ["organiser-add-video", "organiser-revenue", "organiser-event-listing"];
const organiser = (over = {}) => ({
  id: "a1", name: "Sujit Roy", email: "sujit@example.com", role: "plays_organiser",
  has_site_account: true, allowed_menu_keys: ALL, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  window.history.pushState({}, "", "/admin");
});

// ------------------------------------------------------------ the 3 pages
describe("the three pages inside /admin", () => {
  it("Organiser Add Video is the site's My Video List, without a Back button", async () => {
    render(<OrganiserAddVideoPage currentAdmin={organiser()} />);
    expect(screen.getByRole("heading", { name: "My Video List" })).toBeTruthy();
    expect(screen.queryByText("Back")).toBeNull();
    await waitFor(() => expect(api.fetchMyVideos).toHaveBeenCalled());
  });

  it("Revenue is the site's Revenue page, without a Back button", async () => {
    render(<OrganiserRevenuePage currentAdmin={organiser()} />);
    expect(screen.getByRole("heading", { name: "Revenue" })).toBeTruthy();
    expect(screen.queryByText("Back")).toBeNull();
    await waitFor(() => expect(api.fetchRevenueSummary).toHaveBeenCalled());
    expect(api.fetchWithdrawalHistory).toHaveBeenCalled();
  });

  it("Organiser Event Listing renders WITHOUT AppProvider and prefills the admin's name and email", () => {
    render(<OrganiserEventListingPage currentAdmin={organiser()} />);
    expect(screen.getByRole("heading", { name: "Event Listing Enquiry" })).toBeTruthy();
    expect(screen.getByDisplayValue("Sujit Roy")).toBeTruthy();
    expect(screen.getByDisplayValue("sujit@example.com")).toBeTruthy();
    expect(screen.queryByText("Back")).toBeNull();
  });

  it.each([
    ["Organiser Add Video", OrganiserAddVideoPage],
    ["Revenue", OrganiserRevenuePage],
    ["Organiser Event Listing", OrganiserEventListingPage],
  ])("%s shows the 'not linked' message and makes NO API call when the admin has no site account", (_n, Page) => {
    render(<Page currentAdmin={organiser({ has_site_account: false })} />);
    expect(screen.getByText(/not linked to a site account/i)).toBeTruthy();
    expect(screen.getByText(/Give admin access/)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /My Video List|Event Listing Enquiry/ })).toBeNull();
    expect(api.fetchMyVideos).not.toHaveBeenCalled();
    expect(api.fetchRevenueSummary).not.toHaveBeenCalled();
  });

  it("on the main site the same page still gets its Back button", () => {
    const onBack = vi.fn();
    render(<MyVideoListPage onBack={onBack} />);
    fireEvent.click(screen.getByText("Back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

// --------------------------------------------------------------- sidebar
describe("admin sidebar", () => {
  const navButtons = () => screen.getAllByRole("button").map((b) => b.textContent.trim());
  const layout = (admin) => render(<AdminLayout currentAdmin={admin} onLogout={() => {}} />);

  it("organiser admin sees exactly the granted organiser menus, not the staff menus", () => {
    layout(organiser());
    const names = navButtons();
    expect(names).toEqual(expect.arrayContaining(["Organiser Add Video", "Revenue", "Organiser Event Listing"]));
    for (const staff of ["Dashboard", "Video Review", "Add Video", "Revenue Sharing", "User Management", "Admin Accounts"]) {
      expect(names).not.toContain(staff);
    }
  });

  it("lands on the first granted menu and switches pages from the sidebar", async () => {
    layout(organiser());
    expect(screen.getByRole("heading", { name: "My Video List" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Revenue" }));
    expect(screen.getByRole("heading", { name: "Revenue" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Organiser Event Listing" }));
    expect(screen.getByRole("heading", { name: "Event Listing Enquiry" })).toBeTruthy();
  });

  it("only the granted menu shows when the role has one menu", () => {
    layout(organiser({ allowed_menu_keys: ["organiser-revenue"] }));
    const names = navButtons();
    expect(names).toContain("Revenue");
    expect(names).not.toContain("Organiser Add Video");
    expect(names).not.toContain("Organiser Event Listing");
    expect(screen.getByRole("heading", { name: "Revenue" })).toBeTruthy();
  });

  it("no granted menu -> the 'no pages yet' message", () => {
    layout(organiser({ allowed_menu_keys: [] }));
    expect(screen.getByText(/No admin pages are available/)).toBeTruthy();
  });

  it("a linked-less organiser admin still gets the menus, and the page explains what is missing", () => {
    layout(organiser({ has_site_account: false }));
    expect(screen.getByText(/not linked to a site account/i)).toBeTruthy();
  });

  it("superadmin never sees the organiser menus (it has no site account of its own)", () => {
    layout({ id: "s1", name: "Boss", email: "b@x.com", role: "superadmin", allowed_menu_keys: null, has_site_account: false });
    const names = navButtons();
    expect(names).toContain("Revenue Sharing");
    for (const n of ["Organiser Add Video", "Revenue", "Organiser Event Listing"]) expect(names).not.toContain(n);
  });

  it.each(ALL)("a staff admin whose list starts with %s does not land on that page", (key) => {
    // initial page = first allowed key when there is no dashboard — the page itself must still refuse
    layout({ id: "s3", name: "Staff", email: "s@x.com", role: "admin", allowed_menu_keys: [key], has_site_account: false });
    expect(screen.queryByRole("heading", { name: /My Video List|Event Listing Enquiry|^Revenue$/ })).toBeNull();
    expect(screen.queryByText(/not linked to a site account/i)).toBeNull();
    expect(api.fetchMyVideos).not.toHaveBeenCalled();
    expect(api.fetchRevenueSummary).not.toHaveBeenCalled();
  });

  it("an ordinary admin never sees them either, even if the keys were somehow in its list", () => {
    layout({ id: "s2", name: "Staff", email: "s@x.com", role: "admin", allowed_menu_keys: [...ALL, "dashboard"], has_site_account: false });
    const names = navButtons();
    for (const n of ["Organiser Add Video", "Revenue", "Organiser Event Listing"]) expect(names).not.toContain(n);
  });
});

// ------------------------------------------------- User Management button
describe("User Management > Give admin access", () => {
  const row = (over) => ({
    id: "u1", name: "Org One", email: "org1@example.com", role: "plays_organiser", is_active: true,
    can_live_stream: false, created_at: "2026-09-01T00:00:00Z", parent_id: null, parent_name: null,
    parent_email: null, has_family_pin: false, has_admin_access: false, ...over,
  });
  const show = async (users, admin = { role: "superadmin" }) => {
    adminApi.fetchAdminUsers.mockResolvedValue(users);
    render(<AdminUsersPage currentAdmin={admin} />);
    await screen.findByText(users[0].email);
  };

  it("shows the button on an organiser without admin access and calls the API, then reloads", async () => {
    adminApi.giveOrganiserAdminAccess.mockResolvedValue({});
    await show([row()]);
    fireEvent.click(screen.getByRole("button", { name: /Give admin access/ }));
    await waitFor(() => expect(adminApi.giveOrganiserAdminAccess).toHaveBeenCalledWith("u1"));
    await waitFor(() => expect(adminApi.fetchAdminUsers).toHaveBeenCalledTimes(2));
  });

  it("shows 'Admin access' instead of the button once linked", async () => {
    await show([row({ has_admin_access: true })]);
    expect(screen.getByText("Admin access")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Give admin access/ })).toBeNull();
  });

  it("not offered for ordinary users or content creators", async () => {
    await show([row({ role: "user", email: "u@example.com" }), row({ id: "u2", role: "content_creator", email: "c@example.com" })]);
    expect(screen.queryByRole("button", { name: /Give admin access/ })).toBeNull();
  });

  it("not offered to a non-superadmin", async () => {
    await show([row()], { role: "admin" });
    expect(screen.queryByRole("button", { name: /Give admin access/ })).toBeNull();
  });

  it("shows the server's error message when it refuses", async () => {
    adminApi.giveOrganiserAdminAccess.mockRejectedValue(new Error("An admin account with this email already exists"));
    await show([row()]);
    fireEvent.click(screen.getByRole("button", { name: /Give admin access/ }));
    expect(await screen.findByText("An admin account with this email already exists")).toBeTruthy();
  });
});
