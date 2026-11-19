import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DATA_REFERINTA_SET } from "../src/eval/ruleaza.js";
import { ruleaza as genereazaPdf } from "../src/genereaza-pdf.js";
import { textDinPdf } from "../src/pdf.js";
import { SchemaFactura, type Factura } from "../src/schema.js";
import { valideazaFactura } from "../src/validare.js";

// Verifica setul real de eval, offline: o greseala in valorile asteptate ar strica eval-ul fara zgomot.
const DIR_FACTURI = fileURLToPath(new URL("../date/facturi/", import.meta.url));
const DIR_ASTEPTAT = fileURLToPath(new URL("../date/asteptat/", import.meta.url));
const FISIER_CODURI = fileURLToPath(new URL("../date/asteptat-validare.json", import.meta.url));
const DIR_PDF = fileURLToPath(new URL("../date/pdf/", import.meta.url));

const facturi = readdirSync(DIR_FACTURI).filter((nume) => nume.endsWith(".txt"));
const asteptate = readdirSync(DIR_ASTEPTAT).filter((nume) => nume.endsWith(".json"));
const pdfuri = existsSync(DIR_PDF) ? readdirSync(DIR_PDF).filter((nume) => nume.endsWith(".pdf")) : [];
const numere = facturi.map((nume) => nume.replace(/\.txt$/, ""));
const coduriAsteptate: Record<string, string[]> = JSON.parse(readFileSync(FISIER_CODURI, "utf8"));

function citesteAsteptat(numar: string): Factura {
  return SchemaFactura.parse(JSON.parse(readFileSync(join(DIR_ASTEPTAT, `${numar}.json`), "utf8")));
}

describe("setul de date", () => {
  it("are 20 de facturi: 15 corecte si 5 cu greseli plantate", () => {
    expect(facturi.length).toBe(20);
    expect(numere.filter((numar) => coduriAsteptate[numar]?.length === 0)).toHaveLength(15);
    expect(numere.filter((numar) => coduriAsteptate[numar]?.length > 0)).toEqual(["16", "17", "18", "19", "20"]);
  });

  it("numeste fisierele cu doua cifre", () => {
    for (const nume of [...facturi, ...asteptate, ...pdfuri]) expect(nume).toMatch(/^\d{2}\.(txt|json|pdf)$/);
  });

  it("are cate un PDF pentru fiecare factura text si invers", () => {
    expect(pdfuri.map((nume) => nume.replace(/\.pdf$/, "")).sort()).toEqual([...numere].sort());
  });

  // Prinde un .txt schimbat fara ca PDF-ul lui sa fie generat din nou (pnpm pdf).
  it("are in date/pdf exact octetii generati acum din date/facturi", async () => {
    const dirTemporar = await mkdtemp(join(tmpdir(), "date-pdf-"));
    try {
      await genereazaPdf({ dirFacturi: DIR_FACTURI, dirPdf: dirTemporar, log: () => {} });
      for (const numar of numere) {
        const generat = await readFile(join(dirTemporar, `${numar}.pdf`));
        const salvat = await readFile(join(DIR_PDF, `${numar}.pdf`));
        expect(Buffer.compare(generat, salvat), `${numar}.pdf`).toBe(0);
      }
    } finally {
      await rm(dirTemporar, { recursive: true, force: true });
    }
  });

  it("are cate un fisier asteptat pentru fiecare factura si invers", () => {
    expect(asteptate.map((nume) => nume.replace(/\.json$/, "")).sort()).toEqual([...numere].sort());
  });

  it("are coduri de validare asteptate pentru fiecare factura si doar pentru ele", () => {
    expect(Object.keys(coduriAsteptate).sort()).toEqual([...numere].sort());
  });

  it("are doar fisiere asteptate care respecta schema, fara campuri in plus", () => {
    for (const numar of numere) {
      const brut = JSON.parse(readFileSync(join(DIR_ASTEPTAT, `${numar}.json`), "utf8"));
      expect(SchemaFactura.safeParse(brut).success, numar).toBe(true);
      expect(Object.keys(brut).sort(), numar).toEqual(["cui", "data", "furnizor", "linii", "total"]);
      for (const linie of brut.linii) expect(Object.keys(linie).sort(), numar).toEqual(["cantitate", "pret", "produs"]);
    }
  });
});

describe.each(numere)("factura %s", (numar) => {
  const text = readFileSync(join(DIR_FACTURI, `${numar}.txt`), "utf8");
  const asteptat = citesteAsteptat(numar);

  // Suma, data si CUI trec prin validator: o factura corecta da [], una gresita exact greselile plantate.
  it("da la validare exact codurile din asteptat-validare.json, la data de referinta a setului", () => {
    const obtinute = valideazaFactura(asteptat, DATA_REFERINTA_SET).map(({ cod }) => cod);
    expect(obtinute).toEqual(coduriAsteptate[numar]);
  });

  it("are furnizorul, CUI-ul si fiecare produs scrise exact ca in text", () => {
    expect(text).toContain(asteptat.furnizor);
    expect(text).toContain(asteptat.cui);
    for (const { produs } of asteptat.linii) expect(text).toContain(produs);
  });

  it("are cel putin o linie", () => {
    expect(asteptat.linii.length).toBeGreaterThan(0);
  });

  // pdfjs nu pastreaza spatiile de la inceputul randului si strange spatiile repetate: se compara randurile, nu asezarea.
  it("are un PDF din care textul paginii da inapoi aceleasi randuri, cu diacritice", async () => {
    const randuri = (t: string) => t.split("\n").map((rand) => rand.replace(/\s+/g, " ").trim()).filter((rand) => rand !== "");
    const extras = await textDinPdf(await readFile(join(DIR_PDF, `${numar}.pdf`)));
    expect(randuri(extras)).toEqual(randuri(text));
  });
});
