import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { creeazaExtractor, type Extractor } from "./extractor.js";
import { createModel, getActiveModelName, readProviderFromEnv, type LlmProvider } from "./lib/llm.js";

// Cu rezerva, principalul reincearca o data si preda repede, in loc sa astepte un minut de backoff.
export const REINCERCARI_PRINCIPAL_CU_REZERVA = 1;
export const REINCERCARI_REZERVA = 2;

const PROVIDERI: LlmProvider[] = ["azureopenai", "gemini", "openai", "anthropic", "xai", "ollama"];

export type ModelNumit = { model: BaseChatModel; nume: string };
export type Modele = { principal: ModelNumit; rezerva: ModelNumit | null };
export type NumeModele = { principal: string; rezerva: string | null };

// LLM_FALLBACK_PROVIDER lipsa sau gol = fara rezerva; o valoare necunoscuta opreste rularea.
function providerRezerva(): LlmProvider | null {
  const brut = process.env.LLM_FALLBACK_PROVIDER ?? "";
  if (brut === "") return null;
  const provider = PROVIDERI.find((p) => p === brut.toLowerCase());
  if (provider) return provider;
  throw new Error(
    `LLM_FALLBACK_PROVIDER invalid (primit "${brut}"). Valori acceptate: ${PROVIDERI.join(" | ")}, ` +
      "sau lipsa pentru o rulare fara rezerva.",
  );
}

// Principalul din LLM_PROVIDER; rezerva din LLM_FALLBACK_PROVIDER, cu LLM_FALLBACK_MODEL peste modelul providerului ei.
// O rezerva identica cu principalul (acelasi provider si model) nu protejeaza nimic, deci este o eroare de configurare.
export function modeleDinMediu(): Modele {
  const provider = readProviderFromEnv();
  const furnizorRezerva = providerRezerva();
  const modelRezerva = process.env.LLM_FALLBACK_MODEL ?? "";
  if (!furnizorRezerva && modelRezerva !== "") {
    throw new Error(`LLM_FALLBACK_MODEL="${modelRezerva}" este setat fara LLM_FALLBACK_PROVIDER; seteaza-le pe amandoua sau niciunul.`);
  }
  const numePrincipal = getActiveModelName(provider);
  const numeRezerva = furnizorRezerva ? modelRezerva || getActiveModelName(furnizorRezerva) : null;
  if (furnizorRezerva === provider && numeRezerva === numePrincipal) {
    throw new Error(
      `Modelul de rezerva este acelasi cu principalul (${provider} / ${numePrincipal}); ` +
        "alege alt LLM_FALLBACK_MODEL sau alt LLM_FALLBACK_PROVIDER.",
    );
  }
  const principal = {
    model: createModel(provider, furnizorRezerva ? { maxRetries: REINCERCARI_PRINCIPAL_CU_REZERVA } : {}),
    nume: numePrincipal,
  };
  if (!furnizorRezerva || numeRezerva === null) return { principal, rezerva: null };

  const rezerva = {
    model: createModel(furnizorRezerva, { model: numeRezerva, maxRetries: REINCERCARI_REZERVA }),
    nume: numeRezerva,
  };
  return { principal, rezerva };
}

export const extractorDinModele = ({ principal, rezerva }: Modele): Extractor =>
  creeazaExtractor(principal.model, principal.nume, rezerva ? [rezerva] : []);

export const numeModele = ({ principal, rezerva }: Modele): NumeModele => ({
  principal: principal.nume,
  rezerva: rezerva?.nume ?? null,
});

export const descriereModele = ({ principal, rezerva }: NumeModele): string =>
  `Model principal: ${principal}, ${rezerva === null ? "fara rezerva" : `rezerva: ${rezerva}`}`;
