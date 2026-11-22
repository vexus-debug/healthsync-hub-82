import { describe, it, expect } from "vitest";
import { amountToCollect, isReleaseBlocked, emptyCapture } from "./billing";

describe("billing rules", () => {
  it("full payment collects the whole total", () => {
    expect(amountToCollect({ ...emptyCapture(), mode: "full" }, 12000)).toBe(12000);
  });
  it("unpaid collects nothing", () => {
    expect(amountToCollect({ ...emptyCapture(), mode: "unpaid", amount: 5000 }, 12000)).toBe(0);
  });
  it("partial deposit cannot exceed total", () => {
    expect(amountToCollect({ ...emptyCapture(), mode: "partial", amount: 20000 }, 12000)).toBe(12000);
    expect(amountToCollect({ ...emptyCapture(), mode: "partial", amount: 4000 }, 12000)).toBe(4000);
  });
  it("blocks release when a balance remains", () => {
    expect(isReleaseBlocked({ total: 10000, amount_paid: 4000, status: "Partial" }, false)).toBe(true);
  });
  it("admin override allows release", () => {
    expect(isReleaseBlocked({ total: 10000, amount_paid: 0, status: "Unpaid" }, true)).toBe(false);
  });
  it("paid invoice or no invoice does not block", () => {
    expect(isReleaseBlocked({ total: 10000, amount_paid: 10000, status: "Paid" }, false)).toBe(false);
    expect(isReleaseBlocked(null, false)).toBe(false);
  });
});
