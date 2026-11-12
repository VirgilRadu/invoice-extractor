import { describe, expect, it } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { FakeToolCallingModel } from "langchain";
import { creeazaExtractor } from "../src/extractor.js";

const FACTURA = {
  furnizor: "Florarie Test SRL",
  cui: "RO45187325",
  data: "2026-10-14",
  linii: [
    { produs: "Ghiveci", cantitate: 2, pret: 45.5 },
    { produs: "Pamant", cantitate: 3, pret: 18.9 },
  ],
  total: 147.7,
};

// Modelul fals intoarce exact structuredResponse, ignorand schema si optiunile.
function modelFals(structuredResponse: unknown) {
  return new FakeToolCallingModel({ structuredResponse });
}

function raspuns(parsed: unknown, usage_metadata?: AIMessage["usage_metadata"]) {
  return { raw: new AIMessage({ content: "", usage_metadata }), parsed };
}

const UZ = { input_tokens: 120, output_tokens: 45, total_tokens: 165 };

describe("creeazaExtractor", () => {
  it("intoarce factura parsata", async () => {
    const extrage = creeazaExtractor(modelFals(raspuns(FACTURA, UZ)), "model-fals");
    const rezultat = await extrage("text factura");
    expect(rezultat.factura).toEqual(FACTURA);
  });

  it("raporteaza tokenii din usage_metadata", async () => {
    const extrage = creeazaExtractor(modelFals(raspuns(FACTURA, UZ)), "model-fals");
    const rezultat = await extrage("text factura");
    expect(rezultat.tokeni).toEqual({ intrare: 120, iesire: 45 });
  });

  it("numara la iesire si tokenii de gandire, care apar doar in total_tokens", async () => {
    // Gemini: total = prompt + gandire + raspuns; output_tokens nu include gandirea.
    const uz = { input_tokens: 100, output_tokens: 40, total_tokens: 190 };
    const extrage = creeazaExtractor(modelFals(raspuns(FACTURA, uz)), "model-fals");
    expect((await extrage("text factura")).tokeni).toEqual({ intrare: 100, iesire: 90 });
  });

  it("nu scade sub output_tokens cand total_tokens lipseste sau e mai mic", async () => {
    const faraTotal = { input_tokens: 100, output_tokens: 40 } as AIMessage["usage_metadata"];
    const totalMic = { input_tokens: 100, output_tokens: 40, total_tokens: 0 };
    for (const uz of [faraTotal, totalMic]) {
      const extrage = creeazaExtractor(modelFals(raspuns(FACTURA, uz)), "model-fals");
      expect((await extrage("text factura")).tokeni).toEqual({ intrare: 100, iesire: 40 });
    }
  });

  it("raporteaza 0 tokeni cand usage_metadata lipseste", async () => {
    const extrage = creeazaExtractor(modelFals(raspuns(FACTURA)), "model-fals");
    const rezultat = await extrage("text factura");
    expect(rezultat.tokeni).toEqual({ intrare: 0, iesire: 0 });
  });

  it("intoarce numele modelului primit", async () => {
    const extrage = creeazaExtractor(modelFals(raspuns(FACTURA, UZ)), "gemini-de-test");
    const rezultat = await extrage("text factura");
    expect(rezultat.model).toBe("gemini-de-test");
  });

  it("masoara latenta ca numar nenegativ", async () => {
    const extrage = creeazaExtractor(modelFals(raspuns(FACTURA, UZ)), "model-fals");
    const rezultat = await extrage("text factura");
    expect(typeof rezultat.latentaMs).toBe("number");
    expect(rezultat.latentaMs).toBeGreaterThanOrEqual(0);
  });

  it("arunca eroare cand parsed este null", async () => {
    const extrage = creeazaExtractor(modelFals(raspuns(null, UZ)), "model-fals");
    await expect(extrage("text factura")).rejects.toThrow(/parsed/);
  });

  it("arunca eroare cand lipseste un camp obligatoriu", async () => {
    const { cui: _cui, ...faraCui } = FACTURA;
    const extrage = creeazaExtractor(modelFals(raspuns(faraCui, UZ)), "model-fals");
    await expect(extrage("text factura")).rejects.toThrow(/cui/);
  });

  it("arunca eroare cand un camp are tipul gresit", async () => {
    const totalText = { ...FACTURA, total: "147.70" };
    const extrage = creeazaExtractor(modelFals(raspuns(totalText, UZ)), "model-fals");
    await expect(extrage("text factura")).rejects.toThrow(/total/);
  });
});
