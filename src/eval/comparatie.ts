// Rulare: pnpm compara (toate rularile), pnpm compara:raport (doar raportul) sau pnpm compara <model> <n> (o rulare)
// Trece fiecare model din lista prin eval-ul pe PDF-uri, fara rezerva, si salveaza fiecare rulare in rezultate/comparatie/;
// rezultate/comparatie.md se scrie doar din rularile salvate.
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { setTimeout as pauza } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { creeazaExtractor, PAUZA_INTRE_APELURI_MS } from "../extractor.js";
import { createModel, readProviderFromEnv, type LlmProvider } from "../lib/llm.js";
import { SchemaFactura } from "../schema.js";
import { raportComparatie, rezumatRulare, type RulareNotata } from "./raport-comparatie.js";
import { caiAsteptate, caiPentruSet, citesteSetul, DATA_REFERINTA_SET, noteazaSetul, ruleazaEval } from "./ruleaza.js";

export type ModelComparat = { nume: string; rulari: number };

// preview are 20 de cereri pe zi pe nivelul gratuit: o rulare de 20 de facturi ii ia toata ziua.
export const MODELE_COMPARATIE: ModelComparat[] = [
  { nume: "gemini-3.5-flash-lite", rulari: 2 },
  { nume: "gemini-3.1-flash-lite", rulari: 2 },
  { nume: "gemini-3-flash-preview", rulari: 1 },
];

// Aceleasi la toate modelele: 3 incercari trec peste un 503 scurt cu 3-6 s de asteptare, nu cu 1-2 minute ca la 6.
// Un 503 mai lung ramane extragere esuata, numarata separat; 429 (cota zilnica) nu se reincearca la nicio valoare.
export const REINCERCARI_COMPARATIE = 2;

export type Rulare = { model: string; rulare: number };

const SchemaExtragere = z.union([
  z.object({ fisier: z.string(), eroare: z.string() }),
  z.object({
    fisier: z.string(),
    factura: SchemaFactura,
    tokeni: z.object({ intrare: z.number(), iesire: z.number() }),
    latentaMs: z.number(),
    model: z.string(),
    dinRezerva: z.boolean(),
  }),
]);

const SchemaRulare = z.object({
  provider: z.string(),
  model: z.string(),
  rulare: z.number().int().min(1),
  inceput: z.iso.datetime(),
  intrare: z.string(),
  dataReferinta: z.string(),
  reincercari: z.number().int().min(0),
  pauzaMs: z.number().min(0),
  facturi: z.array(SchemaExtragere),
});

export type RulareSalvata = z.infer<typeof SchemaRulare>;

// COMPARA_MODELE="model:rulari,model:rulari" inlocuieste lista implicita; lipsa sau gol = lista implicita.
// Separatorul este ultimul ":", ca un nume ca qwen3:8b sa ramana intreg.
export function listaComparatie(valoare: string | undefined): ModelComparat[] {
  if (valoare === undefined || valoare.trim() === "") return MODELE_COMPARATIE;
  const lista = valoare.split(",").map((parte) => {
    const potrivire = /^(.+):(\d+)$/.exec(parte.trim());
    const rulari = Number(potrivire?.[2]);
    const nume = potrivire?.[1].trim() ?? "";
    if (!potrivire || nume === "" || rulari < 1) {
      throw new Error(`COMPARA_MODELE invalid la "${parte}": se scrie model:rulari, separate prin virgula, cu rulari >= 1.`);
    }
    return { nume, rulari };
  });
  const repetat = lista.find(({ nume }, index) => lista.findIndex((m) => m.nume === nume) !== index);
  if (repetat) throw new Error(`COMPARA_MODELE are modelul ${repetat.nume} de doua ori.`);
  return lista;
}

// In runde: prima rulare a fiecarui model, apoi a doua, ca ora (si incarcarea serverelor) sa nu cada pe un singur model.
export function ordineRulari(lista: ModelComparat[]): Rulare[] {
  const runde = Math.max(0, ...lista.map(({ rulari }) => rulari));
  return Array.from({ length: runde }, (_, index) => index + 1).flatMap((rulare) =>
    lista.filter(({ rulari }) => rulari >= rulare).map(({ nume }) => ({ model: nume, rulare })),
  );
}

export type Comanda = { tip: "toate" } | { tip: "raport" } | { tip: "una"; rulare: Rulare };

export function comandaDinArgumente(argumente: string[], lista: ModelComparat[]): Comanda {
  if (argumente.length === 0) return { tip: "toate" };
  if (argumente.length === 1 && argumente[0] === "raport") return { tip: "raport" };
  if (argumente.length === 2) {
    const [model, numar] = argumente;
    const rulare = /^\d+$/.test(numar) ? Number(numar) : 0;
    if (ordineRulari(lista).some((r) => r.model === model && r.rulare === rulare)) return { tip: "una", rulare: { model, rulare } };
  }
  const modele = lista.map(({ nume, rulari }) => `${nume} (${rulari} rulari)`).join(", ");
  throw new Error(
    `Argumente necunoscute: "${argumente.join(" ")}". Fara argument: toate rularile; "raport": doar raportul, din rularile ` +
      `salvate; "<model> <n>": doar rularea n a modelului. Modele: ${modele}.`,
  );
}

// Fiecare model direct din llm.ts, cu providerul din mediu; rezerva din LLM_FALLBACK_* nu se foloseste aici.
export const creeazaModelComparatie =
  (provider: LlmProvider) =>
  (nume: string): BaseChatModel =>
    createModel(provider, { model: nume, maxRetries: REINCERCARI_COMPARATIE });

// Caracterele din afara [A-Za-z0-9._-] devin "_", ca numele modelului sa fie un nume de fisier.
export const fisierRulare = (dirRulari: string, { model, rulare }: Rulare) =>
  join(dirRulari, `${model.replace(/[^A-Za-z0-9._-]/g, "_")}-${rulare}.json`);

// Setul si caile eval-ului pe PDF (pnpm eval:pdf): aceleasi facturi, valori si coduri asteptate, aceeasi zi de referinta.
export function caiComparatie() {
  const { dirFacturi, intrare } = caiPentruSet("pdf");
  return {
    dirFacturi,
    intrare,
    ...caiAsteptate(),
    dataReferinta: DATA_REFERINTA_SET,
    dirRulari: fileURLToPath(new URL("../../rezultate/comparatie/", import.meta.url)),
    fisierRaport: fileURLToPath(new URL("../../rezultate/comparatie.md", import.meta.url)),
  };
}

export type OptiuniRaport = {
  lista: ModelComparat[];
  dirFacturi: string;
  dirAsteptat: string;
  fisierCoduriAsteptate: string;
  dataReferinta: string;
  dirRulari: string;
  fisierRaport: string;
};

export type RaportScris = { raport: string; rulari: RulareNotata[] };

async function citesteRulare(dirRulari: string, rulare: Rulare): Promise<RulareSalvata> {
  const fisier = fisierRulare(dirRulari, rulare);
  let brut: unknown;
  try {
    brut = JSON.parse(await readFile(fisier, "utf8"));
  } catch (eroare) {
    const mesaj = eroare instanceof Error ? eroare.message : String(eroare);
    throw new Error(`${fisier}: rularea salvata nu poate fi citita: ${mesaj}`, { cause: eroare });
  }
  const verificat = SchemaRulare.safeParse(brut);
  if (!verificat.success) throw new Error(`${fisier}: rularea salvata nu respecta schema:\n${z.prettifyError(verificat.error)}`);
  const { model, rulare: numar, facturi } = verificat.data;
  if (model !== rulare.model || numar !== rulare.rulare) {
    throw new Error(`${fisier}: fisierul are rularea ${model} #${numar}, numele lui cere ${rulare.model} #${rulare.rulare}`);
  }
  // Fara rezerva, fiecare factura extrasa e a modelului rularii; altfel costul s-ar calcula cu pretul altui model.
  for (const factura of facturi) {
    if ("eroare" in factura || (factura.model === model && !factura.dinRezerva)) continue;
    throw new Error(
      `${fisier}: ${factura.fisier} are raspunsul lui ${factura.model}${factura.dinRezerva ? ", din rezerva" : ""}; ` +
        `rularea este a lui ${model}, fara rezerva`,
    );
  }
  return verificat.data;
}

// Raportul se scrie doar din rularile salvate, toate cele de pe lista, notate din nou fata de set: fara apeluri la model.
export async function refaRaportul({ lista, dirRulari, fisierRaport, ...optiuniSet }: OptiuniRaport): Promise<RaportScris> {
  const set = await citesteSetul(optiuniSet);
  const rulari: RulareNotata[] = [];
  for (const { nume, rulari: numar } of lista) {
    for (let rulare = 1; rulare <= numar; rulare += 1) {
      const salvata = await citesteRulare(dirRulari, { model: nume, rulare });
      const fisier = fisierRulare(dirRulari, { model: nume, rulare });
      if (salvata.dataReferinta !== optiuniSet.dataReferinta) {
        throw new Error(
          `${fisier}: rularea a fost notata fata de ziua de referinta ${salvata.dataReferinta}, setul cere ${optiuniSet.dataReferinta}`,
        );
      }
      try {
        rulari.push({ salvata, eval: noteazaSetul(set, salvata.facturi, optiuniSet.dataReferinta) });
      } catch (eroare) {
        throw new Error(`${fisier}: ${eroare instanceof Error ? eroare.message : String(eroare)}`, { cause: eroare });
      }
    }
  }
  const raport = raportComparatie(rulari, { rezultateBrute: `${relative(dirname(fisierRaport), dirRulari)}/<model>-<n>.json` });
  await mkdir(dirname(fisierRaport), { recursive: true });
  await writeFile(fisierRaport, raport, "utf8");
  return { raport, rulari };
}

export type OptiuniComparatie = OptiuniRaport & {
  provider: string;
  creeazaModel: (nume: string) => BaseChatModel;
  reincercari: number;
  intrare: string;
  pauzaMs: number;
  log: (linie: string) => void;
  asteapta?: (ms: number) => Promise<void>;
  acum?: () => Date;
  // Doar aceasta rulare de pe lista, de exemplu cand una a fost pierduta; raportul se reface din toate.
  doar?: Rulare;
};

// Rularile merg pe rand, factura cu factura, cu pauzaMs intre apeluri si intre rulari; fiecare model are extractorul
// lui, fara rezerva, deci o factura la care modelul pica ramane esuata.
export async function ruleazaComparatia({
  provider,
  creeazaModel,
  reincercari,
  intrare,
  pauzaMs,
  log,
  asteapta = (ms) => pauza(ms),
  acum = () => new Date(),
  doar,
  ...optiuniRaport
}: OptiuniComparatie): Promise<RaportScris> {
  const { lista, dirRulari, dirFacturi, dirAsteptat, fisierCoduriAsteptate, dataReferinta } = optiuniRaport;
  const rulari = ordineRulari(lista).filter((r) => !doar || (r.model === doar.model && r.rulare === doar.rulare));
  if (doar && rulari.length === 0) throw new Error(`Rularea ${doar.model} #${doar.rulare} nu este pe lista comparatiei`);
  // Toate modelele se construiesc inainte de primul apel, ca o cheie lipsa sa opreasca rularea de la inceput.
  const extractoare = new Map(
    [...new Set(rulari.map(({ model }) => model))].map((nume) => [nume, creeazaExtractor(creeazaModel(nume), nume)]),
  );
  await mkdir(dirRulari, { recursive: true });

  for (const [index, rulare] of rulari.entries()) {
    if (index > 0) await asteapta(pauzaMs);
    const total = lista.find(({ nume }) => nume === rulare.model)?.rulari;
    log(`\n${rulare.model}, rularea ${rulare.rulare} din ${total}`);
    const inceput = acum().toISOString();
    const { brute, ...rezultat } = await ruleazaEval({
      extrage: extractoare.get(rulare.model)!,
      dirFacturi,
      dirAsteptat,
      fisierCoduriAsteptate,
      dataReferinta,
      pauzaMs,
      log,
      asteapta,
    });
    const salvata: RulareSalvata = { provider, ...rulare, inceput, intrare, dataReferinta, reincercari, pauzaMs, facturi: brute };
    const fisier = fisierRulare(dirRulari, rulare);
    await writeFile(fisier, `${JSON.stringify(salvata, null, 2)}\n`, "utf8");
    log(`${rezumatRulare({ salvata, eval: rezultat })}\nSalvat: ${fisier}`);
  }
  return refaRaportul(optiuniRaport);
}

export type OptiuniRulare = OptiuniRaport &
  Pick<OptiuniComparatie, "intrare" | "pauzaMs" | "log" | "asteapta" | "acum"> & {
    comanda: Comanda;
    // Cerute doar cand comanda face apeluri, ca raportul sa se refaca fara cheie.
    modele: () => { provider: string; creeazaModel: (nume: string) => BaseChatModel };
  };

// Raportul se reface din rularile salvate; toate rularile sau una fac apeluri, apoi refac raportul.
export async function ruleaza({ comanda, modele, ...optiuni }: OptiuniRulare): Promise<RaportScris> {
  const { lista, log, fisierRaport } = optiuni;
  let scris: RaportScris;
  if (comanda.tip === "raport") {
    scris = await refaRaportul(optiuni);
  } else {
    const { provider, creeazaModel } = modele();
    const descriere = lista.map(({ nume, rulari }) => `${nume} x${rulari}`).join(", ");
    log(`Provider ${provider}, fara rezerva, maxRetries ${REINCERCARI_COMPARATIE}; modele: ${descriere}`);
    log(`Intrare: ${optiuni.intrare}`);
    scris = await ruleazaComparatia({
      ...optiuni,
      provider,
      creeazaModel,
      reincercari: REINCERCARI_COMPARATIE,
      ...(comanda.tip === "una" ? { doar: comanda.rulare } : {}),
    });
  }
  log("");
  for (const rulare of scris.rulari) log(rezumatRulare(rulare));
  log(`Scris: ${fisierRaport}`);
  return scris;
}

// .env se incarca doar cand fisierul e rulat ca script, niciodata la import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await import("dotenv/config");
  const lista = listaComparatie(process.env.COMPARA_MODELE);
  await ruleaza({
    comanda: comandaDinArgumente(process.argv.slice(2), lista),
    lista,
    ...caiComparatie(),
    pauzaMs: PAUZA_INTRE_APELURI_MS,
    log: console.log,
    modele: () => {
      const provider = readProviderFromEnv();
      return { provider, creeazaModel: creeazaModelComparatie(provider) };
    },
  });
}
