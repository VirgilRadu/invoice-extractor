import type { Factura } from "./schema.js";
import { statusFactura, type Problema } from "./validare.js";

// factura null = extragerea a esuat; problema ei spune de ce.
export type RandFactura = { fisier: string; factura: Factura | null; probleme: Problema[] };

const COLOANE = ["fisier", "furnizor", "cui", "data", "produs", "cantitate", "pret", "total", "status", "probleme"];

// Campul cu virgula, ghilimele sau linie noua se pune intre ghilimele, cu " dublat.
function camp(valoare: string | number): string {
  const text = String(valoare);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

// Un rand pe linie de factura; factura fara linii sau esuata are un rand, ca nicio factura sa nu dispara.
export function inCsv(facturi: RandFactura[]): string {
  const randuri = [COLOANE];
  for (const { fisier, factura, probleme } of facturi) {
    const verdict = [statusFactura(probleme), probleme.map(({ mesaj }) => mesaj).join("; ")];
    if (factura === null) {
      randuri.push([fisier, "", "", "", "", "", "", "", ...verdict].map(camp));
      continue;
    }
    const { furnizor, cui, data, total } = factura;
    const linii = factura.linii.length > 0 ? factura.linii : [{ produs: "", cantitate: "", pret: "" }];
    for (const { produs, cantitate, pret } of linii) {
      randuri.push([fisier, furnizor, cui, data, produs, cantitate, pret, total, ...verdict].map(camp));
    }
  }
  return randuri.map((rand) => rand.join(",") + "\n").join("");
}
