import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createModel,
  getActiveModelName,
  readProviderFromEnv,
} from "../../src/lib/llm.js";

// Fiecare test porneste fara variabilele LLM si lasa process.env cum l-a gasit.
const VARIABILE = ["LLM_PROVIDER", "GOOGLE_API_KEY", "GEMINI_MODEL"] as const;
let mediuSalvat: NodeJS.ProcessEnv;

beforeEach(() => {
  mediuSalvat = { ...process.env };
  for (const nume of VARIABILE) delete process.env[nume];
});

afterEach(() => {
  for (const nume of Object.keys(process.env)) {
    if (!(nume in mediuSalvat)) delete process.env[nume];
  }
  Object.assign(process.env, mediuSalvat);
});

describe("readProviderFromEnv", () => {
  it("arunca eroare cand LLM_PROVIDER lipseste", () => {
    expect(() => readProviderFromEnv()).toThrow(/LLM_PROVIDER/);
  });

  it("arunca eroare cand LLM_PROVIDER este invalid", () => {
    process.env.LLM_PROVIDER = "inexistent";
    expect(() => readProviderFromEnv()).toThrow(/LLM_PROVIDER/);
  });

  it("intoarce gemini cand LLM_PROVIDER este gemini", () => {
    process.env.LLM_PROVIDER = "gemini";
    expect(readProviderFromEnv()).toBe("gemini");
  });

  it("intoarce gemini si cand este scris cu majuscule", () => {
    process.env.LLM_PROVIDER = "GEMINI";
    expect(readProviderFromEnv()).toBe("gemini");
  });
});

describe("createModel", () => {
  it("arunca eroare de GOOGLE_API_KEY cand cheia lipseste", () => {
    expect(() => createModel("gemini")).toThrow(/GOOGLE_API_KEY/);
  });

  it("construieste modelul gemini-3.5-flash-lite cand GEMINI_MODEL lipseste", () => {
    // Cheie falsa: constructorul nu face apeluri de retea.
    process.env.GOOGLE_API_KEY = "cheie-de-test";
    const model = createModel("gemini") as unknown as { model: string };
    expect(model.model).toBe("gemini-3.5-flash-lite");
  });
});

describe("getActiveModelName", () => {
  it("intoarce gemini-3.5-flash-lite cand GEMINI_MODEL lipseste", () => {
    expect(getActiveModelName("gemini")).toBe("gemini-3.5-flash-lite");
  });

  it("intoarce valoarea din GEMINI_MODEL cand este setata", () => {
    process.env.GEMINI_MODEL = "gemini-model-de-test";
    expect(getActiveModelName("gemini")).toBe("gemini-model-de-test");
  });
});
