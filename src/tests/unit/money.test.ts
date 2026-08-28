import { describe, expect, it } from "vitest";

import {
  formatMoney,
  fractionDigits,
  isCurrency,
  parseMoney,
  toDecimalString,
} from "@/lib/money";

describe("parseMoney — VND (no minor unit)", () => {
  it.each([
    ["250000", 250_000],
    ["250.000", 250_000],
    ["250,000", 250_000],
    ["250 000", 250_000],
    ["1.234", 1_234],
    ["0", 0],
  ])("%s → %i", (input, expected) => {
    const r = parseMoney(input, "VND");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(expected);
  });

  it("never treats a separator as a decimal point", () => {
    // ₫1.234 means one thousand two hundred and thirty-four dong. Reading it
    // as 1.234 dong would be off by a factor of a thousand, silently.
    const r = parseMoney("1.234", "VND");
    if (r.ok) expect(r.value).toBe(1_234);
  });
});

describe("parseMoney — USD (two decimal places)", () => {
  it.each([
    ["19.99", 1_999],
    ["19,99", 1_999],
    ["1,234.56", 123_456],
    ["1.234,56", 123_456],
    ["100", 10_000],
    ["0.05", 5],
  ])("%s → %i minor units", (input, expected) => {
    const r = parseMoney(input, "USD");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(expected);
  });

  it("reads a three-digit group as thousands, not as a fraction", () => {
    const r = parseMoney("1.234", "USD");
    if (r.ok) expect(r.value).toBe(123_400);
  });

  it("survives the float that started all this", () => {
    // 0.1 + 0.2 !== 0.3 in float. In minor units it is 10 + 20 === 30.
    const a = parseMoney("0.10", "USD");
    const b = parseMoney("0.20", "USD");
    if (a.ok && b.ok) expect(a.value + b.value).toBe(30);
  });
});

describe("parseMoney — rejections", () => {
  it.each(["", "   ", "abc", "12abc", "$19.99", "1e5", "NaN"])(
    "rejects %s",
    (input) => {
      expect(parseMoney(input, "USD").ok).toBe(false);
    },
  );

  it("rejects a value past the safe-integer range rather than rounding it", () => {
    expect(parseMoney("99999999999999999999", "USD").ok).toBe(false);
  });
});

describe("toDecimalString", () => {
  it.each([
    [250_000, "VND", "250000"],
    [1_999, "USD", "19.99"],
    [5, "USD", "0.05"],
    [0, "USD", "0.00"],
    [-1_999, "USD", "-19.99"],
  ] as const)("%i %s → %s", (minor, currency, expected) => {
    expect(toDecimalString(minor, currency)).toBe(expected);
  });

  it("round-trips through parseMoney", () => {
    for (const minor of [0, 1, 99, 100, 123_456, 999_999_999]) {
      const text = toDecimalString(minor, "USD");
      const back = parseMoney(text, "USD");
      expect(back.ok).toBe(true);
      if (back.ok) expect(back.value).toBe(minor);
    }
  });
});

describe("formatMoney", () => {
  it("shows no decimal places for VND and two for USD", () => {
    expect(formatMoney({ minor: 250_000, currency: "VND" })).not.toContain(".");
    expect(formatMoney({ minor: 1_999, currency: "USD" })).toContain("19.99");
  });
});

describe("currency helpers", () => {
  it("narrows a known currency code", () => {
    expect(isCurrency("VND")).toBe(true);
    expect(isCurrency("GBP")).toBe(false);
  });

  it("knows VND has no minor unit", () => {
    expect(fractionDigits("VND")).toBe(0);
    expect(fractionDigits("USD")).toBe(2);
  });
});
