import { describe, expect, it } from "vitest";
import { sumarConsum, type ConsumFactura } from "../../src/eval/consum.js";
import { calculateCost } from "../../src/lib/cost.js";

const LITE = "gemini-3.5-flash-lite";

function reusita(fisier: string, intrare: number, iesire: number, latentaMs: number, model = LITE): ConsumFactura {
  return { fisier, corecte: 8, controale: 8, tokeni: { intrare, iesire }, latentaMs, model };
}

function esuata(fisier: string): ConsumFactura {
  return { fisier, corecte: 0, controale: 8, tokeni: { intrare: 0, iesire: 0 }, latentaMs: null, model: null };
}

describe("sumarConsum", () => {
  it("calculeaza costul fiecarei facturi cu calculateCost", () => {
    const { facturi } = sumarConsum([reusita("01.txt", 1000, 200, 1500)]);
    // gemini-3.5-flash-lite: 0.30 intrare, 2.50 iesire la 1M tokeni
    expect(facturi[0].cost).toBeCloseTo((1000 * 0.3 + 200 * 2.5) / 1_000_000, 15);
    expect(facturi[0].cost).toBe(calculateCost(LITE, 1000, 200));
  });

  it("aduna tokenii si costul si face media costului si a latentei pe extragerile reusite", () => {
    const sumar = sumarConsum([reusita("01.txt", 1000, 200, 1500), esuata("02.txt"), reusita("03.txt", 2000, 400, 2500)]);
    expect(sumar.intrare).toBe(3000);
    expect(sumar.iesire).toBe(600);
    expect(sumar.cost).toBeCloseTo((3000 * 0.3 + 600 * 2.5) / 1_000_000, 15);
    expect(sumar.extrase).toBe(2);
    expect(sumar.costMediu).toBeCloseTo((3000 * 0.3 + 600 * 2.5) / 1_000_000 / 2, 15);
    expect(sumar.latentaMedieMs).toBe(2000);
    expect(sumar.latentaMaxMs).toBe(2500);
  });

  it("nu numara latenta unei extrageri esuate si ii da cost 0", () => {
    const sumar = sumarConsum([reusita("01.txt", 10, 5, 100), esuata("02.txt")]);
    expect(sumar.facturi[1].cost).toBe(0);
    expect(sumar.latentaMedieMs).toBe(100);
    expect(sumar.latentaMaxMs).toBe(100);
  });

  it("nu imparte la zero cand toate extragerile au esuat", () => {
    const sumar = sumarConsum([esuata("01.txt"), esuata("02.txt")]);
    expect(sumar).toMatchObject({
      intrare: 0,
      iesire: 0,
      cost: 0,
      extrase: 0,
      costMediu: null,
      latentaMedieMs: null,
      latentaMaxMs: null,
    });
  });

  it("marcheaza costul ca necunoscut cand modelul nu are pret, in loc de 0", () => {
    const sumar = sumarConsum([reusita("01.txt", 1000, 200, 1500, "model-fals"), esuata("02.txt")]);
    expect(sumar.facturi[0].cost).toBeNull();
    expect(sumar.facturi[1].cost).toBe(0);
    expect(sumar.cost).toBeNull();
    expect(sumar.costMediu).toBeNull();
  });
});
