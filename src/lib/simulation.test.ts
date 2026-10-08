import { describe, expect, it } from "vitest";
import { calculateSimulation, normalizeNumericInput, normalizeTicker } from "./simulation";

describe("calculateSimulation", () => {
  it("calculates the current profit and fixed decline scenarios without intermediate rounding", () => {
    const result = calculateSimulation({
      price: 2600,
      quantity: 150,
      averageCost: 2600,
      lossLimit: 50_000,
    });

    expect(result.acquisitionTotal).toBe(390_000);
    expect(result.profitLoss).toBe(0);
    expect(result.scenarios[0]).toMatchObject({
      price: 2470,
      additionalLoss: 19_500,
      profitLoss: -19_500,
      exceeded: false,
    });
    expect(result.scenarios[2]).toMatchObject({
      price: 2210,
      profitLoss: -58_500,
      exceeded: true,
      difference: -8_500,
    });
    expect(result.thresholdPrice).toBeCloseTo(2266.6666667);
  });

  it("clamps an unreachable loss threshold to zero", () => {
    const result = calculateSimulation({
      price: 1000,
      quantity: 10,
      averageCost: 1000,
      lossLimit: 20_000,
    });
    expect(result.thresholdPrice).toBe(0);
    expect(result.neverExceededAtZero).toBe(true);
  });

  it("detects when the input price already exceeds the loss tolerance", () => {
    const result = calculateSimulation({
      price: 500,
      quantity: 100,
      averageCost: 1000,
      lossLimit: 40_000,
    });
    expect(result.currentLoss).toBe(50_000);
    expect(result.currentExceeded).toBe(true);
  });
});

describe("input normalization", () => {
  it("normalizes full-width ticker characters", () => {
    expect(normalizeTicker(" ａＢ12 ")).toBe("AB12");
  });

  it("removes separators and currency symbols", () => {
    expect(normalizeNumericInput(" ￥1,234 円 ")).toBe("1234");
  });
});
