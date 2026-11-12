import { describe, expect, it } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { FakeToolCallingModel } from "langchain";
import { creeazaExtractor } from "../src/extractor.js";
import { ModelCarePica, ModelCareRaspunde } from "./modele-false.js";

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

describe("creeazaExtractor cu rezerve", () => {
  const UZ_REZERVA = { input_tokens: 700, output_tokens: 90, total_tokens: 820 };
  const pica = (mesaj = "503 Service Unavailable: high demand") => new ModelCarePica(new Error(mesaj));

  it("foloseste principalul cand raspunde; rezerva nu este apelata", async () => {
    const principal = new ModelCareRaspunde({ structuredResponse: raspuns(FACTURA, UZ) });
    const rezerva = new ModelCareRaspunde({ structuredResponse: raspuns(FACTURA, UZ_REZERVA) });
    const extrage = creeazaExtractor(principal, "principal", [{ model: rezerva, nume: "rezerva" }]);

    const rezultat = await extrage("text factura");

    expect(rezultat).toMatchObject({
      factura: FACTURA,
      model: "principal",
      dinRezerva: false,
      tokeni: { intrare: 120, iesire: 45 },
    });
    expect([principal.apeluri, rezerva.apeluri]).toEqual([1, 0]);
  });

  it("trece pe rezerva cand principalul arunca; modelul si tokenii sunt ai rezervei", async () => {
    const principal = pica();
    const rezerva = new ModelCareRaspunde({ structuredResponse: raspuns(FACTURA, UZ_REZERVA) });
    const extrage = creeazaExtractor(principal, "principal", [{ model: rezerva, nume: "rezerva" }]);

    const rezultat = await extrage("text factura");

    expect(rezultat).toMatchObject({
      factura: FACTURA,
      model: "rezerva",
      dinRezerva: true,
      tokeni: { intrare: 700, iesire: 120 },
    });
    expect([principal.apeluri, rezerva.apeluri]).toEqual([1, 1]);
  });

  it("cand pica toate, eroarea numeste fiecare model incercat si eroarea lui, in ordine", async () => {
    const principal = pica("503 principal");
    const rezerva = pica("429 rezerva");
    const extrage = creeazaExtractor(principal, "principal", [{ model: rezerva, nume: "rezerva" }]);

    const eroare = await extrage("text factura").catch((e: unknown) => e);

    expect(eroare).toBeInstanceOf(Error);
    expect((eroare as Error).message).toBe("principal: 503 principal; rezerva: 429 rezerva");
    expect((eroare as Error).cause).toBe(principal.eroare);
    expect([principal.apeluri, rezerva.apeluri]).toEqual([1, 1]);
  });

  it("scrie pe un singur rand eroarea pe mai multe randuri a unui model", async () => {
    const extrage = creeazaExtractor(pica("503 Service Unavailable\n  high demand"), "principal", [
      { model: pica("429 Too Many Requests\n* Quota exceeded"), nume: "rezerva" },
      { model: pica("500 intern"), nume: "a-doua" },
    ]);
    await expect(extrage("text factura")).rejects.toThrow(
      /^principal: 503 Service Unavailable high demand; rezerva: 429 Too Many Requests \* Quota exceeded; a-doua: 500 intern$/,
    );
  });

  it("tine erorile fiecarei extrageri separat cand doua extrageri ruleaza in acelasi timp", async () => {
    const principal = new ModelCarePica((text) => new Error(`503 ${text}`), 20);
    const rezerva = new ModelCarePica((text) => new Error(`429 ${text}`), 5);
    const extrage = creeazaExtractor(principal, "principal", [{ model: rezerva, nume: "rezerva" }]);

    const rezultate = await Promise.allSettled([extrage("A"), extrage("B")]);

    expect(rezultate.map((r) => (r.status === "rejected" ? (r.reason as Error).message : "rezolvat"))).toEqual([
      "principal: 503 A; rezerva: 429 A",
      "principal: 503 B; rezerva: 429 B",
    ]);
  });

  it("nu trimite la rezerva un raspuns sosit dar fara factura (parsed null)", async () => {
    const principal = new ModelCareRaspunde({ structuredResponse: raspuns(null, UZ) });
    const rezerva = new ModelCareRaspunde({ structuredResponse: raspuns(FACTURA, UZ_REZERVA) });
    const extrage = creeazaExtractor(principal, "principal", [{ model: rezerva, nume: "rezerva" }]);

    await expect(extrage("text factura")).rejects.toThrow(/parsed/);
    expect(rezerva.apeluri).toBe(0);
  });

  it("nu trimite la rezerva un raspuns care nu respecta schema", async () => {
    const principal = new ModelCareRaspunde({ structuredResponse: raspuns({ ...FACTURA, total: "147.70" }, UZ) });
    const rezerva = new ModelCareRaspunde({ structuredResponse: raspuns(FACTURA, UZ_REZERVA) });
    const extrage = creeazaExtractor(principal, "principal", [{ model: rezerva, nume: "rezerva" }]);

    await expect(extrage("text factura")).rejects.toThrow(/total/);
    expect(rezerva.apeluri).toBe(0);
  });

  it("incearca rezervele in ordine si se opreste la prima care raspunde", async () => {
    const principal = pica();
    const prima = pica("503 prima rezerva");
    const aDoua = new ModelCareRaspunde({ structuredResponse: raspuns(FACTURA, UZ_REZERVA) });
    const aTreia = new ModelCareRaspunde({ structuredResponse: raspuns(FACTURA, UZ) });
    const extrage = creeazaExtractor(principal, "principal", [
      { model: prima, nume: "prima" },
      { model: aDoua, nume: "a-doua" },
      { model: aTreia, nume: "a-treia" },
    ]);

    expect(await extrage("text factura")).toMatchObject({ model: "a-doua", dinRezerva: true });
    expect([principal.apeluri, prima.apeluri, aDoua.apeluri, aTreia.apeluri]).toEqual([1, 1, 1, 0]);
  });

  it("marcheaza raspunsul rezervei si cand rezerva are acelasi nume ca principalul", async () => {
    const rezerva = new ModelCareRaspunde({ structuredResponse: raspuns(FACTURA, UZ) });
    const extrage = creeazaExtractor(pica(), "acelasi-model", [{ model: rezerva, nume: "acelasi-model" }]);
    expect(await extrage("text factura")).toMatchObject({ model: "acelasi-model", dinRezerva: true });
  });

  it("fara rezerve, raspunsul nu este al rezervei", async () => {
    expect((await creeazaExtractor(modelFals(raspuns(FACTURA, UZ)), "principal")("text")).dinRezerva).toBe(false);
  });

  it("fara rezerve, eroarea principalului ajunge neschimbata la apelant", async () => {
    const principal = pica("503 singur");
    await expect(creeazaExtractor(principal, "principal")("text factura")).rejects.toThrow(/^503 singur$/);
  });
});
