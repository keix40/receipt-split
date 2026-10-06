import { describe, expect, it } from "vitest";
import { convertMinorUnits, currencyUnitLabel, inputToMinor, minorToInput } from "@/lib/money";

describe("currency-aware money inputs", () => {
  it("labels Kyat as Ks and others by symbol", () => {
    expect(currencyUnitLabel("MMK")).toBe("Ks");
    expect(currencyUnitLabel("USD")).toBe("$");
  });

  it("round-trips major-unit input to minor units", () => {
    expect(minorToInput(21_000, "MMK")).toBe("21000");
    expect(inputToMinor("21,000", "MMK")).toBe(21_000);
    expect(minorToInput(1250, "USD")).toBe("12.50");
    expect(inputToMinor("12.5", "USD")).toBe(1250);
    expect(inputToMinor("", "USD")).toBeNull();
  });

  it("keeps the printed number when switching currency", () => {
    expect(convertMinorUnits(21_000, "MMK", "USD")).toBe(2_100_000);
    expect(convertMinorUnits(1250, "USD", "MMK")).toBe(13);
  });
});
