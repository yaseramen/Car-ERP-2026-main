import { describe, it, expect } from "vitest";
import { WALLET_TOPUP_MIN_AMOUNT, WALLET_TOPUP_MAX_RECEIPT_BLOBS_PER_COMPANY } from "./wallet-topup-constants";

describe("wallet-topup constants", () => {
  it("enforces 50 EGP minimum", () => {
    expect(WALLET_TOPUP_MIN_AMOUNT).toBe(50);
  });

  it("caps processed receipt blobs per company at 5", () => {
    expect(WALLET_TOPUP_MAX_RECEIPT_BLOBS_PER_COMPANY).toBe(5);
  });
});
