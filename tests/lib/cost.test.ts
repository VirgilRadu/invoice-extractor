import { describe, expect, it } from "vitest";
import { calculateCost, formatCost } from "../../src/lib/cost.js";

const UN_MILION = 1_000_000;

describe("calculateCost", () => {
  it("calculeaza costul pentru un model din tabel", () => {
    // gpt-4o-mini: 0.15 intrare, 0.6 iesire la 1M tokeni
    expect(calculateCost("gpt-4o-mini", 2 * UN_MILION, UN_MILION / 2)).toBeCloseTo(
      2 * 0.15 + 0.5 * 0.6,
      10,
    );
  });

  it("intoarce 0 pentru un model necunoscut", () => {
    expect(calculateCost("model-inexistent", UN_MILION, UN_MILION)).toBe(0);
  });

  it("pune pret dupa cel mai lung prefix pentru un sufix cu data", () => {
    // prefixul gpt-4o-mini castiga in fata lui gpt-4o (2.5 + 10)
    expect(
      calculateCost("gpt-4o-mini-2024-07-18", UN_MILION, UN_MILION),
    ).toBeCloseTo(0.15 + 0.6, 10);
  });

  it("pune pret pe gemini-3.5-flash-lite dupa randul lui, nu dupa gemini-3.5-flash", () => {
    const lite = calculateCost("gemini-3.5-flash-lite", UN_MILION, UN_MILION);
    const flash = calculateCost("gemini-3.5-flash", UN_MILION, UN_MILION);
    expect(lite).toBeCloseTo(0.3 + 2.5, 10);
    expect(lite).not.toBeCloseTo(flash, 10);
  });
});

describe("formatCost", () => {
  it("intoarce n/a pentru cost 0", () => {
    expect(formatCost(0)).toBe("n/a");
  });
});
