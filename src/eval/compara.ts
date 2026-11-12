import type { Factura } from "../schema.js";

export const CONTROALE_FACTURA = ["furnizor", "cui", "data", "total", "linii"] as const;
export const CONTROALE_LINIE = ["produs", "cantitate", "pret"] as const;

export type ControlFactura = (typeof CONTROALE_FACTURA)[number];
export type ControlLinie = (typeof CONTROALE_LINIE)[number];
export type Control = ControlFactura | ControlLinie;

// linie e numarul liniei asteptate, de la 1; lipseste la controalele de factura.
export type Esec = { control: Control; linie?: number; asteptat: unknown; obtinut: unknown };

export type ComparatieFactura = {
  factura: Record<ControlFactura, boolean>;
  linii: Record<ControlLinie, boolean>[];
  esecuri: Esec[];
};

export type RezultatFactura =
  | { fisier: string; asteptat: Factura; obtinut: Factura }
  | { fisier: string; asteptat: Factura; eroare: string };

export type Scor = { corecte: number; total: number; acuratete: number };
export type DetaliuFactura = { fisier: string; eroare?: string; esecuri: Esec[] };

export type SumarEval = {
  controale: Record<Control, Scor>;
  facturi: number;
  facturiComplete: number;
  corecte: number;
  totalControale: number;
  acurateteTotala: number;
  detalii: DetaliuFactura[];
};

// Epsilonul acopera doar zgomotul de virgula mobila, nu largeste toleranta.
const EPSILON = 1e-9;

const text = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const cui = (s: string) => s.replace(/\s+/g, "").toUpperCase().replace(/^RO/, "");
const aproape = (toleranta: number) => (a: number, b: number) => Math.abs(a - b) <= toleranta + EPSILON;
const suma = aproape(0.01);
const cantitate = aproape(0.001);

const EGAL_FACTURA: Record<Exclude<ControlFactura, "linii">, (a: Factura, b: Factura) => boolean> = {
  furnizor: (a, b) => text(a.furnizor) === text(b.furnizor),
  cui: (a, b) => cui(a.cui) === cui(b.cui),
  data: (a, b) => a.data === b.data,
  total: (a, b) => suma(a.total, b.total),
};

type Linie = Factura["linii"][number];
const EGAL_LINIE: Record<ControlLinie, (a: Linie, b: Linie) => boolean> = {
  produs: (a, b) => text(a.produs) === text(b.produs),
  cantitate: (a, b) => cantitate(a.cantitate, b.cantitate),
  pret: (a, b) => suma(a.pret, b.pret),
};

// Liniile se compara pe pozitie; o linie lipsa pica toate controalele ei, liniile in plus pica doar "linii".
export function comparaFactura(asteptat: Factura, obtinut: Factura): ComparatieFactura {
  const esecuri: Esec[] = [];
  const factura = {} as Record<ControlFactura, boolean>;
  for (const control of CONTROALE_FACTURA) {
    const ok =
      control === "linii" ? asteptat.linii.length === obtinut.linii.length : EGAL_FACTURA[control](asteptat, obtinut);
    factura[control] = ok;
    if (!ok) {
      const valoare = (f: Factura) => (control === "linii" ? f.linii.length : f[control]);
      esecuri.push({ control, asteptat: valoare(asteptat), obtinut: valoare(obtinut) });
    }
  }

  const linii = asteptat.linii.map((linieAsteptata, index) => {
    const linieObtinuta = obtinut.linii[index];
    const rezultat = {} as Record<ControlLinie, boolean>;
    for (const control of CONTROALE_LINIE) {
      const ok = linieObtinuta !== undefined && EGAL_LINIE[control](linieAsteptata, linieObtinuta);
      rezultat[control] = ok;
      if (!ok) {
        esecuri.push({ control, linie: index + 1, asteptat: linieAsteptata[control], obtinut: linieObtinuta?.[control] });
      }
    }
    return rezultat;
  });

  return { factura, linii, esecuri };
}

const acuratete = (corecte: number, total: number) => (total === 0 ? 0 : corecte / total);

// Controalele de factura se numara peste facturi, cele de linie peste liniile asteptate.
// O extragere esuata are toate controalele gresite.
export function sumarEval(rezultate: RezultatFactura[]): SumarEval {
  const numaratoare = Object.fromEntries(
    [...CONTROALE_FACTURA, ...CONTROALE_LINIE].map((control) => [control, { corecte: 0, total: 0 }]),
  ) as Record<Control, { corecte: number; total: number }>;
  const adauga = (control: Control, ok: boolean) => {
    numaratoare[control].total += 1;
    if (ok) numaratoare[control].corecte += 1;
  };

  let facturiComplete = 0;
  const detalii: DetaliuFactura[] = [];
  for (const rezultat of rezultate) {
    if ("eroare" in rezultat) {
      for (const control of CONTROALE_FACTURA) adauga(control, false);
      for (const _ of rezultat.asteptat.linii) for (const control of CONTROALE_LINIE) adauga(control, false);
      detalii.push({ fisier: rezultat.fisier, eroare: rezultat.eroare, esecuri: [] });
      continue;
    }
    const comparatie = comparaFactura(rezultat.asteptat, rezultat.obtinut);
    for (const control of CONTROALE_FACTURA) adauga(control, comparatie.factura[control]);
    for (const linie of comparatie.linii) for (const control of CONTROALE_LINIE) adauga(control, linie[control]);
    if (comparatie.esecuri.length === 0) facturiComplete += 1;
    detalii.push({ fisier: rezultat.fisier, esecuri: comparatie.esecuri });
  }

  const controale = Object.fromEntries(
    Object.entries(numaratoare).map(([control, { corecte, total }]) => [
      control,
      { corecte, total, acuratete: acuratete(corecte, total) },
    ]),
  ) as Record<Control, Scor>;
  const scoruri = Object.values(controale);
  const corecte = scoruri.reduce((acc, scor) => acc + scor.corecte, 0);
  const totalControale = scoruri.reduce((acc, scor) => acc + scor.total, 0);

  return {
    controale,
    facturi: rezultate.length,
    facturiComplete,
    corecte,
    totalControale,
    acurateteTotala: acuratete(corecte, totalControale),
    detalii,
  };
}
