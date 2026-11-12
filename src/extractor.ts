import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage, type AIMessage } from "@langchain/core/messages";
import { z } from "zod";
import { SchemaFactura, type Factura } from "./schema.js";

export type RezultatExtragere = {
  factura: Factura;
  tokeni: { intrare: number; iesire: number };
  latentaMs: number;
  model: string;
};

export type Extractor = (text: string) => Promise<RezultatExtragere>;

const INSTRUCTIUNE =
  "Extragi datele unei facturi din textul primit. " +
  "Scrie ce spune documentul: nu corecta si nu calcula nicio valoare, nici macar daca pare gresita. " +
  "Data o scrii ca YYYY-MM-DD. Sumele le scrii ca numere, cu punct zecimal.";

// Modelul doar extrage; raspunsul care nu respecta schema este respins, nu reparat.
export function creeazaExtractor(model: BaseChatModel, numeModel: string): Extractor {
  const structurat = model.withStructuredOutput(SchemaFactura, { includeRaw: true });

  return async (text) => {
    const start = performance.now();
    const raspuns = await structurat.invoke([new SystemMessage(INSTRUCTIUNE), new HumanMessage(text)]);
    const latentaMs = performance.now() - start;

    if (raspuns.parsed == null) {
      throw new Error("Modelul nu a intors o factura: parsed lipseste (raspunsul nu respecta schema)");
    }
    const verificat = SchemaFactura.safeParse(raspuns.parsed);
    if (!verificat.success) {
      throw new Error(`Raspunsul modelului nu respecta schema:\n${z.prettifyError(verificat.error)}`);
    }

    const uz = (raspuns.raw as AIMessage | undefined)?.usage_metadata;
    return {
      factura: verificat.data,
      tokeni: { intrare: uz?.input_tokens ?? 0, iesire: uz?.output_tokens ?? 0 },
      latentaMs,
      model: numeModel,
    };
  };
}
