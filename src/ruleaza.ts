// Rulare: pnpm start
// Citeste facturile din date/facturi, le extrage cu modelul si scrie rezultate/facturi.csv.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { citesteFacturi } from "./citire.js";
import { inCsv, type RandFactura } from "./csv.js";
import { creeazaExtractor, type Extractor } from "./extractor.js";
import { createModel, getActiveModelName, readProviderFromEnv } from "./lib/llm.js";

export type OptiuniRulare = {
  extrage: Extractor;
  dirIntrare: string;
  fisierIesire: string;
  log: (linie: string) => void;
};

// Facturile se extrag pe rand; prima extragere esuata opreste rularea si numeste fisierul.
export async function ruleaza({ extrage, dirIntrare, fisierIesire, log }: OptiuniRulare): Promise<void> {
  const randuri: RandFactura[] = [];
  for (const { fisier, text } of await citesteFacturi(dirIntrare)) {
    const { factura, tokeni, latentaMs, model } = await extrage(text).catch((eroare: unknown) => {
      const mesaj = eroare instanceof Error ? eroare.message : String(eroare);
      throw new Error(`${fisier}: ${mesaj}`, { cause: eroare });
    });
    log(
      `${fisier}: ${factura.linii.length} linii, tokeni ${tokeni.intrare} intrare / ${tokeni.iesire} iesire, ` +
        `${Math.round(latentaMs)} ms (${model})`,
    );
    randuri.push({ fisier, factura });
  }
  await mkdir(dirname(fisierIesire), { recursive: true });
  await writeFile(fisierIesire, inCsv(randuri), "utf8");
}

// .env se incarca doar cand fisierul e rulat ca script, niciodata la import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await import("dotenv/config");
  const provider = readProviderFromEnv();
  const fisierIesire = fileURLToPath(new URL("../rezultate/facturi.csv", import.meta.url));
  await ruleaza({
    extrage: creeazaExtractor(createModel(provider), getActiveModelName(provider)),
    dirIntrare: fileURLToPath(new URL("../date/facturi/", import.meta.url)),
    fisierIesire,
    log: console.log,
  });
  console.log("Scris: rezultate/facturi.csv");
}
