// Rulare: pnpm eval
// Extrage facturile din date/facturi, le compara cu date/asteptat, le valideaza si scrie rezultate/eval.md.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as pauza } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { citesteFacturi } from "../citire.js";
import { PAUZA_INTRE_APELURI_MS, type Extractor } from "../extractor.js";
import { formatCost } from "../lib/cost.js";
import { descriereModele, extractorDinModele, modeleDinMediu, numeModele } from "../model.js";
import { SchemaFactura, type Factura } from "../schema.js";
import { CODURI_VALIDARE, valideazaFactura, verificaZiuaDeReferinta, type CodValidare } from "../validare.js";
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
import { sumarValidare, type SumarValidare, type ValidareFactura } from "./validare.js";

// Ziua fata de care setul de date e validat; fixa, ca "data in viitor" asteptata sa ramana adevarata oricand.
export const DATA_REFERINTA_SET = "2026-11-12";

export type OptiuniEval = {
  extrage: Extractor;
  dirFacturi: string;
  dirAsteptat: string;
  fisierCoduriAsteptate: string;
  dataReferinta: string;
  pauzaMs: number;
  log: (linie: string) => void;
  asteapta?: (ms: number) => Promise<void>;
};

export type RezultatEval = { sumar: SumarEval; consum: SumarConsum; validare: SumarValidare };

const SchemaCoduri = z.record(z.string(), z.array(z.enum(CODURI_VALIDARE)));

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

// Codurile asteptate, pe numarul facturii ("01"); fisierul lipsa sau un cod necunoscut opresc eval-ul.
async function citesteCoduriAsteptate(fisier: string): Promise<Record<string, CodValidare[]>> {
  let brut: unknown;
  try {
    brut = JSON.parse(await readFile(fisier, "utf8"));
  } catch (eroare) {
    const mesaj = eroare instanceof Error ? eroare.message : String(eroare);
    throw new Error(`${fisier}: codurile asteptate nu pot fi citite: ${mesaj}`, { cause: eroare });
  }
  const verificat = SchemaCoduri.safeParse(brut);
  if (!verificat.success) {
    throw new Error(`${fisier}: codurile asteptate nu respecta schema:\n${z.prettifyError(verificat.error)}`);
  }
  return verificat.data;
}

const coduri = (lista: CodValidare[]) => (lista.length === 0 ? "ok" : lista.join(", "));

// Data de referinta, valorile si codurile asteptate se verifica inainte de primul apel la model;
// o extragere esuata se noteaza si se continua.
export async function ruleazaEval({
  extrage,
  dirFacturi,
  dirAsteptat,
  fisierCoduriAsteptate,
  dataReferinta,
  pauzaMs,
  log,
  asteapta = (ms) => pauza(ms),
}: OptiuniEval): Promise<RezultatEval> {
  verificaZiuaDeReferinta(dataReferinta);
  const documente = await citesteFacturi(dirFacturi);
  const asteptate = await Promise.all(
    documente.map(({ fisier }) => citesteAsteptat(join(dirAsteptat, fisier.replace(/\.txt$/, ".json")))),
  );
  const toateCodurile = await citesteCoduriAsteptate(fisierCoduriAsteptate);
  const coduriAsteptate = documente.map(({ fisier }) => {
    const lista = toateCodurile[fisier.replace(/\.txt$/, "")];
    if (lista === undefined) throw new Error(`${fisierCoduriAsteptate}: lipsesc codurile asteptate pentru ${fisier}`);
    return lista;
  });

  const rezultate: RezultatFactura[] = [];
  const consum: ConsumFactura[] = [];
  const validari: ValidareFactura[] = [];
  for (const [index, { fisier, text }] of documente.entries()) {
    if (index > 0) await asteapta(pauzaMs);
    const asteptat = asteptate[index];
    const controale = CONTROALE_FACTURA.length + CONTROALE_LINIE.length * asteptat.linii.length;
    try {
      const { factura, tokeni, latentaMs, model, dinRezerva } = await extrage(text);
      const corecte = controale - comparaFactura(asteptat, factura).esecuri.length;
      const obtinute = valideazaFactura(factura, dataReferinta).map(({ cod }) => cod);
      log(
        `${fisier}: ${corecte}/${controale} controale corecte, model ${model}, tokeni ${tokeni.intrare} intrare / ` +
          `${tokeni.iesire} iesire, ${Math.round(latentaMs)} ms, ` +
          `validare: ${coduri(obtinute)} (asteptat: ${coduri(coduriAsteptate[index])})`,
      );
      rezultate.push({ fisier, asteptat, obtinut: factura });
      consum.push({ fisier, corecte, controale, tokeni, latentaMs, model, dinRezerva });
      validari.push({ fisier, asteptate: coduriAsteptate[index], obtinute });
    } catch (eroare) {
      const mesaj = eroare instanceof Error ? eroare.message : String(eroare);
      log(`${fisier}: extragere esuata: ${mesaj}`);
      rezultate.push({ fisier, asteptat, eroare: mesaj });
      consum.push({ fisier, corecte: 0, controale, tokeni: { intrare: 0, iesire: 0 }, latentaMs: null, model: null, dinRezerva: false });
      validari.push({ fisier, asteptate: coduriAsteptate[index], obtinute: null });
    }
  }
  return {
    sumar: sumarEval(rezultate),
    consum: sumarConsum(consum),
    validare: sumarValidare(validari, dataReferinta),
  };
}

export type OptiuniRulareEval = OptiuniEval & MetaRaport & { fisierIesire: string };

// Ruleaza eval-ul si scrie raportul cu acuratetea, validarea, tokenii, costul si latenta.
export async function ruleaza({
  fisierIesire,
  principal,
  rezerva,
  dataRulare,
  ...optiuni
}: OptiuniRulareEval): Promise<RezultatEval> {
  const { log } = optiuni;
  const rezultat = await ruleazaEval(optiuni);
  const { sumar, consum, validare } = rezultat;
  await mkdir(dirname(fisierIesire), { recursive: true });
  await writeFile(fisierIesire, raportEval(sumar, consum, validare, { principal, rezerva, dataRulare }), "utf8");
  log(`\n${tabelCampuri(sumar)}\n`);
  log(`Facturi complet corecte: ${sumar.facturiComplete} din ${sumar.facturi}`);
  log(`Acuratete totala: ${(sumar.acurateteTotala * 100).toFixed(1)}%`);
  log(
    `Extrageri esuate: ${sumar.esuate} din ${sumar.facturi}; acuratete pe facturile extrase: ` +
      `${sumar.acurateteExtrase === null ? "-" : `${(sumar.acurateteExtrase * 100).toFixed(1)}%`}`,
  );
  log(
    `Validare (referinta ${validare.dataReferinta}): gresite semnalate ${validare.gresiteSemnalate} din ` +
      `${validare.gresite}, corecte lasate ok ${validare.corecteOk} din ${validare.corecte}, ` +
      `coduri exacte ${validare.potrivite} din ${validare.total}`,
  );
  log(`Tokeni: ${consum.intrare} intrare / ${consum.iesire} iesire`);
  log(`Rezerva a raspuns la ${consum.deRezerva} facturi`);
  log(`Au raspuns: ${consum.modele.map(({ model, facturi }) => `${model} la ${facturi}`).join(", ") || "niciun model"}`);
  log(`Cost: ${consum.cost === null ? "pret necunoscut" : formatCost(consum.cost)}`);
  log(`Scris: ${fisierIesire}`);
  return rezultat;
}

// .env se incarca doar cand fisierul e rulat ca script, niciodata la import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await import("dotenv/config");
  const modele = modeleDinMediu();
  console.log(descriereModele(numeModele(modele)));
  await ruleaza({
    extrage: extractorDinModele(modele),
    dirFacturi: fileURLToPath(new URL("../../date/facturi/", import.meta.url)),
    dirAsteptat: fileURLToPath(new URL("../../date/asteptat/", import.meta.url)),
    fisierCoduriAsteptate: fileURLToPath(new URL("../../date/asteptat-validare.json", import.meta.url)),
    dataReferinta: DATA_REFERINTA_SET,
    fisierIesire: fileURLToPath(new URL("../../rezultate/eval.md", import.meta.url)),
    pauzaMs: PAUZA_INTRE_APELURI_MS,
    log: console.log,
    ...numeModele(modele),
    dataRulare: new Date().toISOString().slice(0, 10),
  });
}
