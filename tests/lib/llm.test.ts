import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createModel,
  getActiveModelName,
  readProviderFromEnv,
} from "../../src/lib/llm.js";

// Fiecare test porneste fara variabilele LLM si lasa process.env cum l-a gasit.
const VARIABILE = [
  "LLM_PROVIDER",
  "GOOGLE_API_KEY",
  "GEMINI_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "OLLAMA_MODEL",
] as const;
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

  describe("[+ Tema 7] optiunile model si maxRetries", () => {
    type Construit = { model: string; caller: { maxRetries: number } };
    beforeEach(() => {
      process.env.GOOGLE_API_KEY = "cheie-de-test";
    });

    it("construieste modelul cerut in optiuni, peste GEMINI_MODEL", () => {
      process.env.GEMINI_MODEL = "gemini-din-mediu";
      expect((createModel("gemini", { model: "x" }) as unknown as Construit).model).toBe("x");
    });

    it("da maxRetries constructorului", () => {
      expect((createModel("gemini", { maxRetries: 1 }) as unknown as Construit).caller.maxRetries).toBe(1);
      expect((createModel("gemini", { maxRetries: 0 }) as unknown as Construit).caller.maxRetries).toBe(0);
    });

    it("fara optiuni pastreaza GEMINI_MODEL si cele 6 reincercari implicite ale bibliotecii", () => {
      process.env.GEMINI_MODEL = "gemini-din-mediu";
      const model = createModel("gemini") as unknown as Construit;
      expect(model.model).toBe("gemini-din-mediu");
      expect(model.caller.maxRetries).toBe(6);
    });

    it("da modelul si maxRetries si celorlalti provideri", () => {
      process.env.OPENAI_API_KEY = "cheie-de-test";
      process.env.ANTHROPIC_API_KEY = "cheie-de-test";
      for (const provider of ["openai", "anthropic", "ollama"] as const) {
        const model = createModel(provider, { model: "m", maxRetries: 2 }) as unknown as Construit;
        expect([model.model, model.caller.maxRetries], provider).toEqual(["m", 2]);
      }
    });
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
