import type { Factura } from "./schema.js";

export type RandFactura = { fisier: string; factura: Factura };

const COLOANE = ["fisier", "furnizor", "cui", "data", "produs", "cantitate", "pret", "total"];

// Campul cu virgula, ghilimele sau linie noua se pune intre ghilimele, cu " dublat.
function camp(valoare: string | number): string {
  const text = String(valoare);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

// Un rand pe linie de factura; o factura fara linii nu produce niciun rand.
export function inCsv(facturi: RandFactura[]): string {
  const randuri = [COLOANE];
  for (const { fisier, factura } of facturi) {
    for (const linie of factura.linii) {
      randuri.push(
        [fisier, factura.furnizor, factura.cui, factura.data, linie.produs, linie.cantitate, linie.pret, factura.total].map(
          camp,
        ),
      );
    }
  }
  return randuri.map((rand) => rand.join(",") + "\n").join("");
}
