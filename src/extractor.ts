import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage, type AIMessage, type BaseMessage } from "@langchain/core/messages";
import { RunnableLambda, type RunnableConfig } from "@langchain/core/runnables";
import { z } from "zod";
import { SchemaFactura, type Factura } from "./schema.js";

export type RezultatExtragere = {
  factura: Factura;
  tokeni: { intrare: number; iesire: number };
  latentaMs: number;
  model: string;
  // true cand a raspuns o rezerva, oricum s-ar numi modelul ei
  dinRezerva: boolean;
};

export type Extractor = (text: string) => Promise<RezultatExtragere>;

// Un model de rezerva si numele lui, pentru pret si raport.
export type Rezerva = { model: BaseChatModel; nume: string };

// 4.5 s intre apeluri tine o rulare sub 15 cereri pe minut (limita gratuita Gemini).
export const PAUZA_INTRE_APELURI_MS = 4500;

const INSTRUCTIUNE =
  "Extragi datele unei facturi din textul primit. " +
  "Scrie ce spune documentul: nu corecta si nu calcula nicio valoare, nici macar daca pare gresita. " +
  "Data o scrii ca YYYY-MM-DD. Sumele le scrii ca numere, cu punct zecimal.";

const structurat = (model: BaseChatModel) => model.withStructuredOutput(SchemaFactura, { includeRaw: true });
type Model = { structurat: ReturnType<typeof structurat>; nume: string; dinRezerva: boolean };

const peUnRand = (eroare: unknown) => (eroare instanceof Error ? eroare.message : String(eroare)).replace(/\s+/g, " ").trim();

// Ramura unei extrageri: raspunsul etichetat cu modelul care a raspuns. Eroarea se noteaza in lista
// acestei extrageri (withFallbacks arunca doar prima eroare), apoi trece mai departe la rezerva.
function ramura({ structurat, nume, dinRezerva }: Model, erori: string[]) {
  return RunnableLambda.from(async (mesaje: BaseMessage[], config?: RunnableConfig) => {
    try {
      return { ...(await structurat.invoke(mesaje, config)), model: nume, dinRezerva };
    } catch (eroare) {
      erori.push(`${nume}: ${peUnRand(eroare)}`);
      throw eroare;
    }
  });
}

// Modelul doar extrage; raspunsul care nu respecta schema este respins, nu reparat.
// Rezervele raspund, in ordine, doar cand ramura dinainte arunca (providerul a picat). Un raspuns sosit
// dar nefolosibil (parsed null sau in afara schemei) nu arunca in ramura, deci nu ajunge la rezerva.
export function creeazaExtractor(model: BaseChatModel, numeModel: string, rezerve: Rezerva[] = []): Extractor {
  const modele: Model[] = [
    { structurat: structurat(model), nume: numeModel, dinRezerva: false },
    ...rezerve.map((rezerva) => ({ structurat: structurat(rezerva.model), nume: rezerva.nume, dinRezerva: true })),
  ];

  return async (text) => {
    // Lista de erori e a acestei extrageri, ca doua extrageri simultane sa nu-si amestece erorile.
    const erori: string[] = [];
    const [principal, ...dupaPrincipal] = modele.map((m) => ramura(m, erori));
    const lant = dupaPrincipal.length === 0 ? principal : principal.withFallbacks(dupaPrincipal);

    const start = performance.now();
    let raspuns: Awaited<ReturnType<typeof principal.invoke>>;
    try {
      raspuns = await lant.invoke([new SystemMessage(INSTRUCTIUNE), new HumanMessage(text)]);
    } catch (eroare) {
      if (dupaPrincipal.length === 0) throw eroare;
      throw new Error(erori.join("; "), { cause: eroare });
    }
    const latentaMs = performance.now() - start;

    if (raspuns.parsed == null) {
      throw new Error("Modelul nu a intors o factura: parsed lipseste (raspunsul nu respecta schema)");
    }
    const verificat = SchemaFactura.safeParse(raspuns.parsed);
    if (!verificat.success) {
      throw new Error(`Raspunsul modelului nu respecta schema:\n${z.prettifyError(verificat.error)}`);
    }

    // Gemini nu pune tokenii de gandire in output_tokens, doar in total_tokens, dar ii factureaza la iesire.
    const uz = (raspuns.raw as AIMessage | undefined)?.usage_metadata;
    const intrare = uz?.input_tokens ?? 0;
    const iesire = Math.max(uz?.output_tokens ?? 0, (uz?.total_tokens ?? 0) - intrare);
    return {
      factura: verificat.data,
      tokeni: { intrare, iesire },
      latentaMs,
      model: raspuns.model,
      dinRezerva: raspuns.dinRezerva,
    };
  };
}
