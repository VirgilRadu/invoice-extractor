// Rulare: pnpm start (textele) sau pnpm start:pdf (copiile PDF)
// Citeste facturile din date/facturi, le extrage cu modelul, le valideaza si scrie rezultate/facturi.csv;
// cu argumentul pdf citeste date/pdf si scrie rezultate/facturi-pdf.csv.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative } from "node:path";
import { setTimeout as pauza } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { citesteFacturi, setDinArgumente, type SetIntrare } from "./citire.js";
import { inCsv, type RandFactura } from "./csv.js";
import { PAUZA_INTRE_APELURI_MS, type Extractor, type RezultatExtragere } from "./extractor.js";
import { descriereModele, extractorDinModele, modeleDinMediu, numeModele } from "./model.js";
import { statusFactura, valideazaFactura, ziuaCalendaristica, type Problema } from "./validare.js";

export type OptiuniRulare = {
  extrage: Extractor;
  dirIntrare: string;
  fisierIesire: string;
  log: (linie: string) => void;
  // Ziua fata de care o data e "in viitor", YYYY-MM-DD; scriptul da ziua curenta.
  azi: string;
  pauzaMs?: number;
  asteapta?: (ms: number) => Promise<void>;
};

const mesajEroare = (eroare: unknown) => (eroare instanceof Error ? eroare.message : String(eroare));

// Facturile se extrag pe rand, cu pauzaMs intre ele; o extragere esuata devine un rand de_verificat si rularea continua.
// Valorile extrase ajung in CSV neschimbate: validarea doar le marcheaza.
export async function ruleaza({
  extrage,
  dirIntrare,
  fisierIesire,
  log,
  azi,
  pauzaMs = 0,
  asteapta = (ms) => pauza(ms),
}: OptiuniRulare): Promise<void> {
  const randuri: RandFactura[] = [];
  for (const [index, { fisier, text }] of (await citesteFacturi(dirIntrare)).entries()) {
    if (index > 0 && pauzaMs > 0) await asteapta(pauzaMs);
    let rezultat: RezultatExtragere;
    try {
      rezultat = await extrage(text);
    } catch (eroare) {
      const mesaj = mesajEroare(eroare);
      log(`${fisier}: extragere esuata -> de_verificat: ${mesaj.replace(/\s+/g, " ").trim()}`);
      const problema: Problema = { cod: "extragere_esuata", mesaj: `extragere esuata: ${mesaj.split(/\r?\n/)[0]}` };
      randuri.push({ fisier, factura: null, probleme: [problema] });
      continue;
    }
    const { factura, tokeni, latentaMs, model } = rezultat;
    const probleme = valideazaFactura(factura, azi);
    const verdict = probleme.length === 0 ? "ok" : `de_verificat: ${probleme.map(({ mesaj }) => mesaj).join("; ")}`;
    log(
      `${fisier}: ${factura.linii.length} linii, tokeni ${tokeni.intrare} intrare / ${tokeni.iesire} iesire, ` +
        `${Math.round(latentaMs)} ms (${model}) -> ${verdict}`,
    );
    randuri.push({ fisier, factura, probleme });
  }
  await mkdir(dirname(fisierIesire), { recursive: true });
  await writeFile(fisierIesire, inCsv(randuri), "utf8");
  const ok = randuri.filter(({ probleme }) => statusFactura(probleme) === "ok").length;
  log(`Facturi: ${randuri.length}, ok: ${ok}, de_verificat: ${randuri.length - ok}`);
}

// PDF-urile au CSV-ul lor, ca rezultatul pe text sa ramana alaturi.
export function caiPentruSet(set: SetIntrare): { dirIntrare: string; fisierIesire: string } {
  const [dir, csv] = set === "pdf" ? ["date/pdf/", "facturi-pdf.csv"] : ["date/facturi/", "facturi.csv"];
  return {
    dirIntrare: fileURLToPath(new URL(`../${dir}`, import.meta.url)),
    fisierIesire: fileURLToPath(new URL(`../rezultate/${csv}`, import.meta.url)),
  };
}

// .env se incarca doar cand fisierul e rulat ca script, niciodata la import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { dirIntrare, fisierIesire } = caiPentruSet(setDinArgumente(process.argv.slice(2)));
  await import("dotenv/config");
  const modele = modeleDinMediu();
  console.log(descriereModele(numeModele(modele)));
  const radacina = fileURLToPath(new URL("..", import.meta.url));
  console.log(`Intrare: ${relative(radacina, dirIntrare)}`);
  await ruleaza({
    extrage: extractorDinModele(modele),
    dirIntrare,
    fisierIesire,
    log: console.log,
    azi: ziuaCalendaristica(new Date()),
    pauzaMs: PAUZA_INTRE_APELURI_MS,
  });
  console.log(`Scris: ${relative(radacina, fisierIesire)}`);
}
