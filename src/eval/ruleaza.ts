// Rulare: pnpm eval
// Extrage facturile din date/facturi, le compara cu date/asteptat si scrie rezultate/eval.md.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as pauza } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { citesteFacturi } from "../citire.js";
import { creeazaExtractor, PAUZA_INTRE_APELURI_MS, type Extractor } from "../extractor.js";
import { formatCost } from "../lib/cost.js";
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
import { sumarConsum, type ConsumFactura, type SumarConsum } from "./consum.js";
import { raportEval, tabelCampuri, type MetaRaport } from "./raport.js";

export type OptiuniEval = {
  extrage: Extractor;
  dirFacturi: string;
  dirAsteptat: string;
  pauzaMs: number;
  log: (linie: string) => void;
  asteapta?: (ms: number) => Promise<void>;
};

export type RezultatEval = { sumar: SumarEval; consum: SumarConsum };

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
}: OptiuniEval): Promise<RezultatEval> {
  const documente = await citesteFacturi(dirFacturi);
  const asteptate = await Promise.all(
    documente.map(({ fisier }) => citesteAsteptat(join(dirAsteptat, fisier.replace(/\.txt$/, ".json")))),
  );

  const rezultate: RezultatFactura[] = [];
  const consum: ConsumFactura[] = [];
  for (const [index, { fisier, text }] of documente.entries()) {
    if (index > 0) await asteapta(pauzaMs);
    const asteptat = asteptate[index];
    const controale = CONTROALE_FACTURA.length + CONTROALE_LINIE.length * asteptat.linii.length;
    try {
      const { factura, tokeni, latentaMs, model } = await extrage(text);
      const corecte = controale - comparaFactura(asteptat, factura).esecuri.length;
      log(
        `${fisier}: ${corecte}/${controale} controale corecte, tokeni ${tokeni.intrare} intrare / ` +
          `${tokeni.iesire} iesire, ${Math.round(latentaMs)} ms`,
      );
      rezultate.push({ fisier, asteptat, obtinut: factura });
      consum.push({ fisier, corecte, controale, tokeni, latentaMs, model });
    } catch (eroare) {
      const mesaj = eroare instanceof Error ? eroare.message : String(eroare);
      log(`${fisier}: extragere esuata: ${mesaj}`);
      rezultate.push({ fisier, asteptat, eroare: mesaj });
      consum.push({ fisier, corecte: 0, controale, tokeni: { intrare: 0, iesire: 0 }, latentaMs: null, model: null });
    }
  }
  return { sumar: sumarEval(rezultate), consum: sumarConsum(consum) };
}

export type OptiuniRulareEval = OptiuniEval & MetaRaport & { fisierIesire: string };

// Ruleaza eval-ul si scrie raportul cu acuratetea, tokenii, costul si latenta.
export async function ruleaza({ fisierIesire, model, dataRulare, ...optiuni }: OptiuniRulareEval): Promise<RezultatEval> {
  const { log } = optiuni;
  const rezultat = await ruleazaEval(optiuni);
  const { sumar, consum } = rezultat;
  await mkdir(dirname(fisierIesire), { recursive: true });
  await writeFile(fisierIesire, raportEval(sumar, consum, { model, dataRulare }), "utf8");
  log(`\n${tabelCampuri(sumar)}\n`);
  log(`Facturi complet corecte: ${sumar.facturiComplete} din ${sumar.facturi}`);
  log(`Acuratete totala: ${(sumar.acurateteTotala * 100).toFixed(1)}%`);
  log(`Tokeni: ${consum.intrare} intrare / ${consum.iesire} iesire`);
  log(`Cost: ${consum.cost === null ? "pret necunoscut" : formatCost(consum.cost)}`);
  log(`Scris: ${fisierIesire}`);
  return rezultat;
}

// .env se incarca doar cand fisierul e rulat ca script, niciodata la import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await import("dotenv/config");
  const provider = readProviderFromEnv();
  const model = getActiveModelName(provider);
  await ruleaza({
    extrage: creeazaExtractor(createModel(provider), model),
    dirFacturi: fileURLToPath(new URL("../../date/facturi/", import.meta.url)),
    dirAsteptat: fileURLToPath(new URL("../../date/asteptat/", import.meta.url)),
    fisierIesire: fileURLToPath(new URL("../../rezultate/eval.md", import.meta.url)),
    pauzaMs: PAUZA_INTRE_APELURI_MS,
    log: console.log,
    model,
    dataRulare: new Date().toISOString().slice(0, 10),
  });
}
