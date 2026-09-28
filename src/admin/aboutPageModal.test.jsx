// User Management > Plays Organiser > "About Page" used to blank the whole admin
// (white screen): the modal called fetchAdminStudioCoverImage without importing it,
// which throws a ReferenceError inside an effect and unmounts the React tree.
import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("./adminApi", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchAdminUsers: vi.fn(),
    fetchAdminOrganiserSections: vi.fn(),
    fetchAdminStudioCoverImage: vi.fn(),
    uploadAdminStudioCoverImage: vi.fn(),
  };
});

import * as adminApi from "./adminApi";
import AdminUsersPage from "./AdminUsersPage";

const organiser = {
  id: "u1", name: "Bohurupee", email: "sujoydas@gmail.com", role: "plays_organiser", is_active: true,
  can_live_stream: true, created_at: "2026-09-01T00:00:00Z", parent_id: null, parent_name: null,
  parent_email: null, has_family_pin: false, has_admin_access: true,
};
// exactly the shape seen in the browser's Network tab
const sections = [{ id: "447cc48b", title: "Bohurupee", content_html: "<p><b>Bohurupee</b> is a Bengali premier theatre group.</p>", display_order: 0 }];

const openAbout = async () => {
  adminApi.fetchAdminUsers.mockResolvedValue([organiser]);
  render(<AdminUsersPage currentAdmin={{ role: "superadmin" }} />);
  await screen.findByText("sujoydas@gmail.com");
  fireEvent.click(screen.getByRole("button", { name: /About Page/ }));
};

beforeEach(() => {
  vi.clearAllMocks();
  adminApi.fetchAdminOrganiserSections.mockResolvedValue(sections);
  adminApi.fetchAdminStudioCoverImage.mockResolvedValue({ cover_image_url: null });
});

describe("About Page modal", () => {
  it("opens without crashing and loads both the sections and the cover image", async () => {
    await openAbout();
    expect(await screen.findByText(/About Bohurupee/)).toBeTruthy();
    await waitFor(() => expect(adminApi.fetchAdminOrganiserSections).toHaveBeenCalledWith("u1"));
    await waitFor(() => expect(adminApi.fetchAdminStudioCoverImage).toHaveBeenCalledWith("u1"));
    expect(screen.getByText("Cover Image")).toBeTruthy();
  });

  it("the rest of the page is still there behind the modal (nothing unmounted)", async () => {
    await openAbout();
    await screen.findByText(/About Bohurupee/);
    expect(screen.getByText("User Management")).toBeTruthy();
  });

  it("shows the cover image when the organiser has one", async () => {
    adminApi.fetchAdminStudioCoverImage.mockResolvedValue({ cover_image_url: "/api/uploads/cover.jpg" });
    await openAbout();
    await waitFor(() => expect(document.querySelector('img[src="/api/uploads/cover.jpg"]')).toBeTruthy());
  });

  it("a failing cover-image request does not break the modal", async () => {
    adminApi.fetchAdminStudioCoverImage.mockRejectedValue(new Error("boom"));
    await openAbout();
    expect(await screen.findByText(/About Bohurupee/)).toBeTruthy();
  });

  it("a failing sections request shows the message instead of a blank screen", async () => {
    adminApi.fetchAdminOrganiserSections.mockRejectedValue(new Error("Couldn't load sections"));
    await openAbout();
    expect(await screen.findByText("Couldn't load sections")).toBeTruthy();
  });
});
