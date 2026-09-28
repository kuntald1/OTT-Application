// Video Review > Edit > "Section Wise Rows": the same curated rows as Special
// Categories > Section Wise Video, picked from the video's side. Saves as you
// tick; only permanent rows of the video's section (or "both").
import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("./adminApi", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchAdminSpecialCategories: vi.fn(),
    addVideoToAdminSpecialCategory: vi.fn(),
    removeVideoFromAdminSpecialCategory: vi.fn(),
    editVideo: vi.fn(),
    fetchAdminAds: vi.fn().mockResolvedValue([]),
    fetchAdminVideoCuePoints: vi.fn().mockResolvedValue([]),
  };
});
vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, fetchCategoryOptions: vi.fn().mockResolvedValue([]) };
});

import * as adminApi from "./adminApi";
import AdminVideoEditForm from "./AdminVideoEditForm";

const video = (over = {}) => ({
  id: "v1", title: "বিচারক", description: "d", section: "play", categories: ["Drama"], release_year: 2026,
  age_rating: "U", languages: ["bengali"], has_ads: false, monetization_type: "subscription_only", pricing: null,
  revenue_tiers: [], cast: [], crew: [], subtitles: [], status: "scheduled", ...over,
});
const row = (id, title, over = {}) => ({
  id, title, section: "play", visible_from: null, visible_to: null, display_order: 0, is_disabled: false,
  video_count: 0, videos: [], ...over,
});
const member = { id: "v1", title: "বিচারক" };

const show = async (rows, v = video(), props = {}) => {
  adminApi.fetchAdminSpecialCategories.mockResolvedValue(rows);
  render(<AdminVideoEditForm video={v} onSave={vi.fn()} onCancel={vi.fn()} {...props} />);
  await waitFor(() => expect(adminApi.fetchAdminSpecialCategories).toHaveBeenCalled());
};
const chip = (name) => screen.getByRole("button", { name });
const chipNames = () => screen.queryAllByRole("button").map((b) => b.textContent.trim());

beforeEach(() => vi.clearAllMocks());

describe("which rows are offered", () => {
  it("permanent rows of the video's section, plus 'both' rows", async () => {
    await show([
      row("r1", "Engaged", { section: "play" }),
      row("r2", "Loventure", { section: "archive" }),
      row("r3", "Everything", { section: "both" }),
    ]);
    await screen.findByRole("button", { name: "Engaged" });
    const names = chipNames();
    expect(names).toContain("Engaged");
    expect(names).toContain("Everything");
    expect(names).not.toContain("Loventure");
  });

  it("an archive video is offered archive rows, not play rows", async () => {
    await show([row("r1", "Engaged", { section: "play" }), row("r2", "Loventure", { section: "archive" })], video({ section: "archive" }));
    await screen.findByRole("button", { name: "Loventure" });
    expect(chipNames()).not.toContain("Engaged");
  });

  it("dated banners (Special Categories tab) are not listed", async () => {
    await show([row("r1", "Engaged"), row("r2", "Sunday Special", { visible_from: "2026-09-01", visible_to: "2026-09-30" })]);
    await screen.findByRole("button", { name: "Engaged" });
    expect(chipNames()).not.toContain("Sunday Special");
  });

  it("rows the video is already in are shown selected", async () => {
    await show([row("r1", "Engaged", { videos: [member] }), row("r2", "Binge")]);
    await screen.findByRole("button", { name: "Engaged" });
    expect(chip("Engaged").style.color).toBe("rgb(212, 175, 55)");
    expect(chip("Binge").style.color).not.toBe("rgb(212, 175, 55)");
  });

  it("a row of the OTHER section that still holds the video stays listed so it can be removed", async () => {
    await show([row("r2", "Loventure", { section: "archive", videos: [member] })]);
    expect(await screen.findByRole("button", { name: "Loventure (other section)" })).toBeTruthy();
  });

  it("a disabled row is marked", async () => {
    await show([row("r1", "Engaged", { is_disabled: true })]);
    expect(await screen.findByRole("button", { name: "Engaged · disabled" })).toBeTruthy();
  });

  it("no matching rows -> tells where to create one", async () => {
    await show([row("r2", "Loventure", { section: "archive" })]);
    expect(await screen.findByText(/No play rows yet/)).toBeTruthy();
  });

  it("lists nothing new for a video that is not in any row and has no rows to join", async () => {
    await show([]);
    expect(await screen.findByText(/No play rows yet/)).toBeTruthy();
  });
});

describe("ticking a row", () => {
  it("adds the video to the row on click, saved immediately, and shows it selected", async () => {
    adminApi.addVideoToAdminSpecialCategory.mockResolvedValue(row("r1", "Engaged", { videos: [member] }));
    await show([row("r1", "Engaged")]);
    fireEvent.click(await screen.findByRole("button", { name: "Engaged" }));
    await waitFor(() => expect(adminApi.addVideoToAdminSpecialCategory).toHaveBeenCalledWith("r1", "v1"));
    expect(adminApi.removeVideoFromAdminSpecialCategory).not.toHaveBeenCalled();
    expect(adminApi.editVideo).not.toHaveBeenCalled();
    await waitFor(() => expect(chip("Engaged").style.color).toBe("rgb(212, 175, 55)"));
  });

  it("removes the video when a selected row is clicked again", async () => {
    adminApi.removeVideoFromAdminSpecialCategory.mockResolvedValue(row("r1", "Engaged", { videos: [] }));
    await show([row("r1", "Engaged", { videos: [member] })]);
    fireEvent.click(await screen.findByRole("button", { name: "Engaged" }));
    await waitFor(() => expect(adminApi.removeVideoFromAdminSpecialCategory).toHaveBeenCalledWith("r1", "v1"));
    expect(adminApi.addVideoToAdminSpecialCategory).not.toHaveBeenCalled();
    await waitFor(() => expect(chip("Engaged").style.color).not.toBe("rgb(212, 175, 55)"));
  });

  it("only touches the clicked row", async () => {
    adminApi.addVideoToAdminSpecialCategory.mockResolvedValue(row("r2", "Binge", { videos: [member] }));
    await show([row("r1", "Engaged"), row("r2", "Binge")]);
    fireEvent.click(await screen.findByRole("button", { name: "Binge" }));
    await waitFor(() => expect(adminApi.addVideoToAdminSpecialCategory).toHaveBeenCalledTimes(1));
    expect(adminApi.addVideoToAdminSpecialCategory).toHaveBeenCalledWith("r2", "v1");
    await waitFor(() => expect(chip("Binge").style.color).toBe("rgb(212, 175, 55)"));
    expect(chip("Engaged").style.color).not.toBe("rgb(212, 175, 55)");
  });

  it("a failed save shows the server's message and leaves the chip as it was", async () => {
    adminApi.addVideoToAdminSpecialCategory.mockRejectedValue(new Error("Special category not found"));
    await show([row("r1", "Engaged")]);
    fireEvent.click(await screen.findByRole("button", { name: "Engaged" }));
    expect(await screen.findByText("Special category not found")).toBeTruthy();
    expect(chip("Engaged").style.color).not.toBe("rgb(212, 175, 55)");
  });

  it("a failed load says so", async () => {
    adminApi.fetchAdminSpecialCategories.mockRejectedValue(new Error("boom"));
    render(<AdminVideoEditForm video={video()} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(await screen.findByText("Couldn't load the Section Wise Video rows.")).toBeTruthy();
  });
});

describe("changing the Section dropdown in the same form", () => {
  it("row chips are locked until the new Section is saved (rows are matched to the saved section)", async () => {
    await show([row("r1", "Engaged")]);
    await screen.findByRole("button", { name: "Engaged" });
    expect(chip("Engaged").disabled).toBe(false);

    // Section dropdown: open it and pick Archive
    fireEvent.click(screen.getByRole("button", { name: /^play$/i }));
    fireEvent.click(screen.getByRole("button", { name: "archive" }));

    expect(chip("Engaged").disabled).toBe(true);
    expect(screen.getByText(/Save the new Section first/)).toBeTruthy();
    fireEvent.click(chip("Engaged"));
    expect(adminApi.addVideoToAdminSpecialCategory).not.toHaveBeenCalled();
  });
});
