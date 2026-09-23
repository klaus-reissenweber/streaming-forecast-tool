import { afterEach, describe, expect, it, vi } from "vitest";

const { getAccountStatus } = vi.hoisted(() => ({
  getAccountStatus: vi.fn(),
}));

vi.mock("./client", () => ({
  getAccountStatus,
}));

import {
  assertBillableAllowed,
  DEFAULT_SONGSTATS_MONTHLY_OBJECT_CAP,
  isBillableEndpoint,
  SongstatsQuotaExceededError,
} from "./quota";

describe("songstats quota guard", () => {
  afterEach(() => {
    getAccountStatus.mockReset();
    delete process.env.SONGSTATS_MONTHLY_OBJECT_CAP;
  });

  it("refuses a billable call at the cap", async () => {
    getAccountStatus.mockResolvedValue({
      current_month_total_requested_objects: DEFAULT_SONGSTATS_MONTHLY_OBJECT_CAP,
    });
    await expect(assertBillableAllowed()).rejects.toBeInstanceOf(
      SongstatsQuotaExceededError,
    );
  });

  it("allows a billable call under the cap", async () => {
    getAccountStatus.mockResolvedValue({
      current_month_total_requested_objects: 4,
    });
    await expect(assertBillableAllowed()).resolves.toBeUndefined();
  });

  it("never refuses a search", () => {
    expect(isBillableEndpoint("artists/search")).toBe(false);
    expect(isBillableEndpoint("tracks/search")).toBe(false);
    expect(isBillableEndpoint("artists/stats")).toBe(true);
    expect(isBillableEndpoint("tracks/info")).toBe(true);
  });
});
