import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SchemaFactura, type Factura } from "../src/schema.js";

// Verifica setul real de eval, offline: o greseala in valorile asteptate ar strica eval-ul fara zgomot.
const DIR_FACTURI = fileURLToPath(new URL("../date/facturi/", import.meta.url));
const DIR_ASTEPTAT = fileURLToPath(new URL("../date/asteptat/", import.meta.url));

const facturi = readdirSync(DIR_FACTURI).filter((nume) => nume.endsWith(".txt"));
const asteptate = readdirSync(DIR_ASTEPTAT).filter((nume) => nume.endsWith(".json"));
const numere = facturi.map((nume) => nume.replace(/\.txt$/, ""));

function citesteAsteptat(numar: string): Factura {
  return SchemaFactura.parse(JSON.parse(readFileSync(join(DIR_ASTEPTAT, `${numar}.json`), "utf8")));
}

function azi(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("setul de date", () => {
  it("are cel putin 15 facturi", () => {
    expect(facturi.length).toBeGreaterThanOrEqual(15);
  });

  it("numeste fisierele cu doua cifre", () => {
    for (const nume of [...facturi, ...asteptate]) expect(nume).toMatch(/^\d{2}\.(txt|json)$/);
  });

  it("are cate un fisier asteptat pentru fiecare factura si invers", () => {
    expect(asteptate.map((nume) => nume.replace(/\.json$/, "")).sort()).toEqual([...numere].sort());
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

  it("are data YYYY-MM-DD, reala si nu din viitor", () => {
    expect(asteptat.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const [an, luna, zi] = asteptat.data.split("-").map(Number);
    const d = new Date(Date.UTC(an, luna - 1, zi));
    expect([d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]).toEqual([an, luna, zi]);
    expect(asteptat.data <= azi()).toBe(true);
  });

  it("are suma liniilor egala cu totalul la 0.01", () => {
    const suma = asteptat.linii.reduce((acc, { cantitate, pret }) => acc + cantitate * pret, 0);
    expect(Math.abs(suma - asteptat.total)).toBeLessThanOrEqual(0.01 + 1e-9);
  });

  it("are furnizorul, CUI-ul si fiecare produs scrise exact ca in text", () => {
    expect(text).toContain(asteptat.furnizor);
    expect(text).toContain(asteptat.cui);
    for (const { produs } of asteptat.linii) expect(text).toContain(produs);
  });

  it("are cel putin o linie", () => {
    expect(asteptat.linii.length).toBeGreaterThan(0);
  });
});
