import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import {
  descriereModele,
  extractorDinModele,
  modeleDinMediu,
  numeModele,
  REINCERCARI_PRINCIPAL_CU_REZERVA,
  REINCERCARI_REZERVA,
} from "../src/model.js";
import { ModelCarePica, ModelCareRaspunde } from "./modele-false.js";

// Fiecare test porneste fara variabilele LLM si lasa process.env cum l-a gasit; cheile sunt false, constructorii nu fac apeluri.
const VARIABILE = [
  "LLM_PROVIDER",
  "GOOGLE_API_KEY",
  "GEMINI_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "LLM_FALLBACK_PROVIDER",
  "LLM_FALLBACK_MODEL",
] as const;
let mediuSalvat: NodeJS.ProcessEnv;

beforeEach(() => {
  mediuSalvat = { ...process.env };
  for (const nume of VARIABILE) delete process.env[nume];
  process.env.LLM_PROVIDER = "gemini";
  process.env.GOOGLE_API_KEY = "cheie-de-test";
  process.env.GEMINI_MODEL = "gemini-principal";
});

afterEach(() => {
  for (const nume of Object.keys(process.env)) {
    if (!(nume in mediuSalvat)) delete process.env[nume];
  }
  Object.assign(process.env, mediuSalvat);
});

type Construit = { model: string; caller: { maxRetries: number } };
const construit = (model: unknown) => model as Construit;

describe("modeleDinMediu", () => {
  it("fara LLM_FALLBACK_PROVIDER nu are rezerva, iar principalul pastreaza reincercarile implicite", () => {
    const { principal, rezerva } = modeleDinMediu();
    expect(principal.nume).toBe("gemini-principal");
    expect(construit(principal.model).model).toBe("gemini-principal");
    expect(construit(principal.model).caller.maxRetries).toBe(6);
    expect(rezerva).toBeNull();
  });

  it("trateaza LLM_FALLBACK_PROVIDER gol ca lipsa", () => {
    process.env.LLM_FALLBACK_PROVIDER = "";
    expect(modeleDinMediu().rezerva).toBeNull();
  });

  it("construieste rezerva cu LLM_FALLBACK_MODEL; principalul reincearca putin, rezerva ceva mai mult", () => {
    process.env.LLM_FALLBACK_PROVIDER = "gemini";
    process.env.LLM_FALLBACK_MODEL = "gemini-3-flash-preview";

    const { principal, rezerva } = modeleDinMediu();

    expect(principal.nume).toBe("gemini-principal");
    expect(construit(principal.model).model).toBe("gemini-principal");
    expect(construit(principal.model).caller.maxRetries).toBe(REINCERCARI_PRINCIPAL_CU_REZERVA);
    expect(rezerva?.nume).toBe("gemini-3-flash-preview");
    expect(construit(rezerva?.model).model).toBe("gemini-3-flash-preview");
    expect(construit(rezerva?.model).caller.maxRetries).toBe(REINCERCARI_REZERVA);
    expect([REINCERCARI_PRINCIPAL_CU_REZERVA, REINCERCARI_REZERVA]).toEqual([1, 2]);
  });

  it("fara LLM_FALLBACK_MODEL, rezerva ia modelul providerului ei din mediu", () => {
    process.env.LLM_FALLBACK_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "cheie-de-test";
    process.env.OPENAI_MODEL = "gpt-din-mediu";

    const { rezerva } = modeleDinMediu();

    expect(rezerva?.nume).toBe("gpt-din-mediu");
    expect(construit(rezerva?.model).model).toBe("gpt-din-mediu");
  });

  it("accepta providerul de rezerva scris cu majuscule", () => {
    process.env.LLM_FALLBACK_PROVIDER = "GEMINI";
    process.env.LLM_FALLBACK_MODEL = "gemini-rezerva";
    expect(modeleDinMediu().rezerva?.nume).toBe("gemini-rezerva");
  });

  it("arunca la pornire cand rezerva este acelasi provider si acelasi model ca principalul", () => {
    process.env.LLM_FALLBACK_PROVIDER = "gemini";
    expect(() => modeleDinMediu()).toThrow(/rezerva.*acelasi.*gemini.*gemini-principal/);
    process.env.LLM_FALLBACK_MODEL = "gemini-principal";
    expect(() => modeleDinMediu()).toThrow(/rezerva.*acelasi.*gemini.*gemini-principal/);
  });

  it("accepta acelasi nume de model la alt provider", () => {
    process.env.LLM_FALLBACK_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "cheie-de-test";
    process.env.LLM_FALLBACK_MODEL = "gemini-principal";
    expect(modeleDinMediu().rezerva?.nume).toBe("gemini-principal");
  });

  it("arunca o eroare clara cand LLM_FALLBACK_MODEL este setat fara LLM_FALLBACK_PROVIDER", () => {
    process.env.LLM_FALLBACK_MODEL = "gemini-3.1-flash-lite";
    expect(() => modeleDinMediu()).toThrow(/LLM_FALLBACK_MODEL.*LLM_FALLBACK_PROVIDER/);
  });

  it("arunca o eroare clara cand LLM_FALLBACK_PROVIDER este invalid", () => {
    process.env.LLM_FALLBACK_PROVIDER = "inexistent";
    expect(() => modeleDinMediu()).toThrow(/LLM_FALLBACK_PROVIDER.*"inexistent".*gemini/);
  });

  it("cere cheia providerului de rezerva", () => {
    process.env.LLM_FALLBACK_PROVIDER = "openai";
    expect(() => modeleDinMediu()).toThrow(/OPENAI_API_KEY/);
  });
});

describe("extractorDinModele", () => {
  const FACTURA = { furnizor: "F SRL", cui: "RO45187325", data: "2026-10-14", linii: [], total: 0 };

  it("leaga rezerva in spatele principalului", async () => {
    const raspuns = { raw: new AIMessage({ content: "" }), parsed: FACTURA };
    const extrage = extractorDinModele({
      principal: { model: new ModelCarePica(new Error("503")), nume: "principal" },
      rezerva: { model: new ModelCareRaspunde({ structuredResponse: raspuns }), nume: "rezerva" },
    });
    expect((await extrage("text")).model).toBe("rezerva");
  });

  it("fara rezerva, eroarea principalului ajunge la apelant", async () => {
    const extrage = extractorDinModele({
      principal: { model: new ModelCarePica(new Error("503")), nume: "principal" },
      rezerva: null,
    });
    await expect(extrage("text")).rejects.toThrow("503");
  });
});

describe("numeModele", () => {
  const model = new ModelCareRaspunde({});

  it("intoarce numele principalului si al rezervei", () => {
    expect(numeModele({ principal: { model, nume: "p" }, rezerva: { model, nume: "r" } })).toEqual({
      principal: "p",
      rezerva: "r",
    });
  });

  it("intoarce rezerva null cand nu exista rezerva", () => {
    expect(numeModele({ principal: { model, nume: "p" }, rezerva: null })).toEqual({ principal: "p", rezerva: null });
  });
});

describe("descriereModele", () => {
  it("numeste principalul si rezerva, sau spune ca nu exista rezerva", () => {
    expect(descriereModele({ principal: "p", rezerva: "r" })).toBe("Model principal: p, rezerva: r");
    expect(descriereModele({ principal: "p", rezerva: null })).toBe("Model principal: p, fara rezerva");
  });
});
