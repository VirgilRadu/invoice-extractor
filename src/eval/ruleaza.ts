// Rulare: pnpm eval
// Extrage cele 15 facturi din date/facturi, le compara cu date/asteptat si scrie rezultate/eval.md.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as pauza } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { citesteFacturi } from "../citire.js";
import { creeazaExtractor, type Extractor } from "../extractor.js";
import { createModel, getActiveModelName, readProviderFromEnv } from "../lib/llm.js";
import { SchemaFactura, type Factura } from "../schema.js";
import {
  CONTROALE_FACTURA,
  CONTROALE_LINIE,
  comparaFactura,
  sumarEval,
  type RezultatFactura,
  type SumarEval,
} from "./compara.js";
import { raportEval, tabelCampuri } from "./raport.js";

export type OptiuniEval = {
  extrage: Extractor;
  dirFacturi: string;
  dirAsteptat: string;
  pauzaMs: number;
  log: (linie: string) => void;
  asteapta?: (ms: number) => Promise<void>;
};

// Valoarea asteptata lipsa sau invalida opreste eval-ul: fara ea factura nu poate fi notata.
async function citesteAsteptat(fisier: string): Promise<Factura> {
  let brut: unknown;
  try {
    brut = JSON.parse(await readFile(fisier, "utf8"));
  } catch (eroare) {
    const mesaj = eroare instanceof Error ? eroare.message : String(eroare);
    throw new Error(`${fisier}: valoarea asteptata nu poate fi citita: ${mesaj}`, { cause: eroare });
  }
  const verificat = SchemaFactura.safeParse(brut);
  if (!verificat.success) {
    throw new Error(`${fisier}: valoarea asteptata nu respecta schema:\n${z.prettifyError(verificat.error)}`);
  }
  return verificat.data;
}

// Toate valorile asteptate se citesc inainte de primul apel la model; o extragere esuata se noteaza si se continua.
export async function ruleazaEval({
  extrage,
  dirFacturi,
  dirAsteptat,
  pauzaMs,
  log,
  asteapta = (ms) => pauza(ms),
}: OptiuniEval): Promise<SumarEval> {
  const documente = await citesteFacturi(dirFacturi);
  const asteptate = await Promise.all(
    documente.map(({ fisier }) => citesteAsteptat(join(dirAsteptat, fisier.replace(/\.txt$/, ".json")))),
  );

  const rezultate: RezultatFactura[] = [];
  for (const [index, { fisier, text }] of documente.entries()) {
    if (index > 0) await asteapta(pauzaMs);
    const asteptat = asteptate[index];
    try {
      const { factura } = await extrage(text);
      const { esecuri } = comparaFactura(asteptat, factura);
      const total = CONTROALE_FACTURA.length + CONTROALE_LINIE.length * asteptat.linii.length;
      log(`${fisier}: ${total - esecuri.length}/${total} controale corecte`);
      rezultate.push({ fisier, asteptat, obtinut: factura });
    } catch (eroare) {
      const mesaj = eroare instanceof Error ? eroare.message : String(eroare);
      log(`${fisier}: extragere esuata: ${mesaj}`);
      rezultate.push({ fisier, asteptat, eroare: mesaj });
    }
  }
  return sumarEval(rezultate);
}

// .env se incarca doar cand fisierul e rulat ca script, niciodata la import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await import("dotenv/config");
  const provider = readProviderFromEnv();
  const model = getActiveModelName(provider);
  // 4.5 s intre apeluri tine rularea sub 15 cereri pe minut (limita gratuita Gemini).
  const sumar = await ruleazaEval({
    extrage: creeazaExtractor(createModel(provider), model),
    dirFacturi: fileURLToPath(new URL("../../date/facturi/", import.meta.url)),
    dirAsteptat: fileURLToPath(new URL("../../date/asteptat/", import.meta.url)),
    pauzaMs: 4500,
    log: console.log,
  });
  const fisierIesire = fileURLToPath(new URL("../../rezultate/eval.md", import.meta.url));
  await mkdir(dirname(fisierIesire), { recursive: true });
  await writeFile(fisierIesire, raportEval(sumar, { model, dataRulare: new Date().toISOString().slice(0, 10) }), "utf8");
  console.log(`\n${tabelCampuri(sumar)}\n`);
  console.log(`Facturi complet corecte: ${sumar.facturiComplete} din ${sumar.facturi}`);
  console.log(`Acuratete totala: ${(sumar.acurateteTotala * 100).toFixed(1)}%`);
  console.log("Scris: rezultate/eval.md");
}
