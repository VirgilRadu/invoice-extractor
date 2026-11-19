// Rulare: pnpm eval (textele) sau pnpm eval:pdf (copiile PDF)
// Extrage facturile din date/facturi, le compara cu date/asteptat, le valideaza si scrie rezultate/eval.md;
// cu argumentul pdf citeste date/pdf si scrie rezultate/eval-pdf.md.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, parse } from "node:path";
import { setTimeout as pauza } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { citesteFacturi, setDinArgumente, type SetIntrare } from "../citire.js";
import { PAUZA_INTRE_APELURI_MS, type Extractor, type RezultatExtragere } from "../extractor.js";
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

// O factura a setului, cu valoarea si codurile pe care eval-ul le asteapta de la ea.
export type FacturaSet = { fisier: string; text: string; asteptat: Factura; coduriAsteptate: CodValidare[] };

// Ce a intors extractorul pentru o factura, rezultatul sau eroarea; din ele notarea se reface fara apeluri la model.
export type ExtragereBruta = ({ fisier: string } & RezultatExtragere) | { fisier: string; eroare: string };

type OptiuniSet = Pick<OptiuniEval, "dirFacturi" | "dirAsteptat" | "fisierCoduriAsteptate" | "dataReferinta">;

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

// Data de referinta, valorile si codurile asteptate se verifica inainte de primul apel la model.
export async function citesteSetul({
  dirFacturi,
  dirAsteptat,
  fisierCoduriAsteptate,
  dataReferinta,
}: OptiuniSet): Promise<FacturaSet[]> {
  verificaZiuaDeReferinta(dataReferinta);
  const documente = await citesteFacturi(dirFacturi);
  // NN.txt si NN.pdf au aceeasi valoare asteptata, NN.json, si aceleasi coduri, pe cheia NN.
  const asteptate = await Promise.all(
    documente.map(({ fisier }) => citesteAsteptat(join(dirAsteptat, `${parse(fisier).name}.json`))),
  );
  const toateCodurile = await citesteCoduriAsteptate(fisierCoduriAsteptate);
  return documente.map(({ fisier, text }, index) => {
    const coduriAsteptate = toateCodurile[parse(fisier).name];
    if (coduriAsteptate === undefined) throw new Error(`${fisierCoduriAsteptate}: lipsesc codurile asteptate pentru ${fisier}`);
    return { fisier, text, asteptat: asteptate[index], coduriAsteptate };
  });
}

type NotaFactura = { rezultat: RezultatFactura; consum: ConsumFactura; validare: ValidareFactura };

function noteazaFactura({ fisier, asteptat, coduriAsteptate }: FacturaSet, bruta: ExtragereBruta, dataReferinta: string): NotaFactura {
  const controale = CONTROALE_FACTURA.length + CONTROALE_LINIE.length * asteptat.linii.length;
  if ("eroare" in bruta) {
    return {
      rezultat: { fisier, asteptat, eroare: bruta.eroare },
      consum: { fisier, corecte: 0, controale, tokeni: { intrare: 0, iesire: 0 }, latentaMs: null, model: null, dinRezerva: false },
      validare: { fisier, asteptate: coduriAsteptate, obtinute: null },
    };
  }
  const { factura, tokeni, latentaMs, model, dinRezerva } = bruta;
  const obtinute = valideazaFactura(factura, dataReferinta).map(({ cod }) => cod);
  return {
    rezultat: { fisier, asteptat, obtinut: factura },
    consum: { fisier, corecte: controale - comparaFactura(asteptat, factura).esecuri.length, controale, tokeni, latentaMs, model, dinRezerva },
    validare: { fisier, asteptate: coduriAsteptate, obtinute },
  };
}

function linieLog(bruta: ExtragereBruta, { consum, validare }: NotaFactura): string {
  if ("eroare" in bruta) return `${bruta.fisier}: extragere esuata: ${bruta.eroare}`;
  const { tokeni, latentaMs, model } = bruta;
  return (
    `${bruta.fisier}: ${consum.corecte}/${consum.controale} controale corecte, model ${model}, tokeni ${tokeni.intrare} intrare / ` +
    `${tokeni.iesire} iesire, ${Math.round(latentaMs)} ms, ` +
    `validare: ${coduri(validare.obtinute ?? [])} (asteptat: ${coduri(validare.asteptate)})`
  );
}

const fisiere = (lista: { fisier: string }[]) => lista.map(({ fisier }) => fisier).join(", ");

// Aceeasi notare pentru o rulare noua si pentru extragerile salvate; extragerile trebuie sa fie ale setului, in ordine.
export function noteazaSetul(set: FacturaSet[], brute: ExtragereBruta[], dataReferinta: string): RezultatEval {
  if (fisiere(brute) !== fisiere(set)) {
    throw new Error(`Extragerile sunt pentru ${fisiere(brute)}, setul are ${fisiere(set)}`);
  }
  const note = set.map((factura, index) => noteazaFactura(factura, brute[index], dataReferinta));
  return {
    sumar: sumarEval(note.map(({ rezultat }) => rezultat)),
    consum: sumarConsum(note.map(({ consum }) => consum)),
    validare: sumarValidare(note.map(({ validare }) => validare), dataReferinta),
  };
}

// O extragere esuata se noteaza si se continua; facturile se extrag pe rand, cu pauzaMs intre ele.
export async function ruleazaEval({
  extrage,
  pauzaMs,
  log,
  asteapta = (ms) => pauza(ms),
  ...optiuniSet
}: OptiuniEval): Promise<RezultatEval & { brute: ExtragereBruta[] }> {
  const set = await citesteSetul(optiuniSet);
  const brute: ExtragereBruta[] = [];
  for (const [index, factura] of set.entries()) {
    if (index > 0) await asteapta(pauzaMs);
    let bruta: ExtragereBruta;
    try {
      bruta = { fisier: factura.fisier, ...(await extrage(factura.text)) };
    } catch (eroare) {
      bruta = { fisier: factura.fisier, eroare: eroare instanceof Error ? eroare.message : String(eroare) };
    }
    brute.push(bruta);
    log(linieLog(bruta, noteazaFactura(factura, bruta, optiuniSet.dataReferinta)));
  }
  return { ...noteazaSetul(set, brute, optiuniSet.dataReferinta), brute };
}

export type OptiuniRulareEval = OptiuniEval & MetaRaport & { fisierIesire: string };

// Ruleaza eval-ul si scrie raportul cu acuratetea, validarea, tokenii, costul si latenta.
export async function ruleaza({
  fisierIesire,
  principal,
  rezerva,
  dataRulare,
  intrare,
  ...optiuni
}: OptiuniRulareEval): Promise<RezultatEval> {
  const { log } = optiuni;
  const rezultat = await ruleazaEval(optiuni);
  const { sumar, consum, validare } = rezultat;
  await mkdir(dirname(fisierIesire), { recursive: true });
  await writeFile(fisierIesire, raportEval(sumar, consum, validare, { principal, rezerva, dataRulare, intrare }), "utf8");
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

// Setul de intrare: directorul, raportul si cum e numit in raport. PDF-urile au raportul lor, langa cel pe text.
export function caiPentruSet(set: SetIntrare): { dirFacturi: string; fisierIesire: string; intrare: string } {
  const [dir, raport, intrare] =
    set === "pdf"
      ? ["date/pdf/", "eval-pdf.md", "date/pdf (PDF, textul paginilor citit cu pdfjs-dist)"]
      : ["date/facturi/", "eval.md", "date/facturi (text)"];
  return {
    dirFacturi: fileURLToPath(new URL(`../../${dir}`, import.meta.url)),
    fisierIesire: fileURLToPath(new URL(`../../rezultate/${raport}`, import.meta.url)),
    intrare,
  };
}

// Valorile si codurile asteptate, aceleasi pentru text si PDF.
export const caiAsteptate = () => ({
  dirAsteptat: fileURLToPath(new URL("../../date/asteptat/", import.meta.url)),
  fisierCoduriAsteptate: fileURLToPath(new URL("../../date/asteptat-validare.json", import.meta.url)),
});

// .env se incarca doar cand fisierul e rulat ca script, niciodata la import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cai = caiPentruSet(setDinArgumente(process.argv.slice(2)));
  await import("dotenv/config");
  const modele = modeleDinMediu();
  console.log(descriereModele(numeModele(modele)));
  console.log(`Intrare: ${cai.intrare}`);
  await ruleaza({
    extrage: extractorDinModele(modele),
    ...cai,
    ...caiAsteptate(),
    dataReferinta: DATA_REFERINTA_SET,
    pauzaMs: PAUZA_INTRE_APELURI_MS,
    log: console.log,
    ...numeModele(modele),
    dataRulare: new Date().toISOString().slice(0, 10),
  });
}
