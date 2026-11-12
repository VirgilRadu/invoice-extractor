import { describe, expect, it } from "vitest";
import { comparaFactura, sumarEval, type RezultatFactura } from "../../src/eval/compara.js";
import type { Factura } from "../../src/schema.js";

const ASTEPTAT: Factura = {
  furnizor: "Flori Verzi S.R.L.",
  cui: "RO45187325",
  data: "2026-10-14",
  linii: [
    { produs: "Ghiveci ceramic 20 cm", cantitate: 2, pret: 45.5 },
    { produs: "Pamant pentru flori", cantitate: 1.25, pret: 18.9 },
  ],
  total: 114.63,
};

function obtinut(campuri: Partial<Factura> = {}): Factura {
  return structuredClone({ ...ASTEPTAT, ...campuri });
}

function cuLinie(index: number, campuri: Partial<Factura["linii"][number]>): Factura {
  const f = obtinut();
  f.linii[index] = { ...f.linii[index], ...campuri };
  return f;
}

const TOATE_LINIE = { produs: true, cantitate: true, pret: true };
const NICIUNA_LINIE = { produs: false, cantitate: false, pret: false };

describe("comparaFactura", () => {
  it("trece toate controalele cand extragerea este identica", () => {
    const rezultat = comparaFactura(ASTEPTAT, obtinut());
    expect(rezultat.factura).toEqual({ furnizor: true, cui: true, data: true, total: true, linii: true });
    expect(rezultat.linii).toEqual([TOATE_LINIE, TOATE_LINIE]);
    expect(rezultat.esecuri).toEqual([]);
  });

  describe("text: furnizor si produs", () => {
    it("ignora spatiile de la capete, spatiile multiple si majusculele", () => {
      const f = cuLinie(0, { produs: "  GHIVECI   ceramic\t20 CM " });
      f.furnizor = " flori  VERZI\ns.r.l. ";
      const rezultat = comparaFactura(ASTEPTAT, f);
      expect(rezultat.factura.furnizor).toBe(true);
      expect(rezultat.linii[0].produs).toBe(true);
    });

    it("pica un furnizor cu alt cuvant", () => {
      expect(comparaFactura(ASTEPTAT, obtinut({ furnizor: "Flori Verzi SRL" })).factura.furnizor).toBe(false);
    });

    it("pica un text cu spatiile scoase, nu doar comprimate", () => {
      expect(comparaFactura(ASTEPTAT, obtinut({ furnizor: "FloriVerzi S.R.L." })).factura.furnizor).toBe(false);
    });

    it("pica un produs trunchiat", () => {
      expect(comparaFactura(ASTEPTAT, cuLinie(0, { produs: "Ghiveci ceramic" })).linii[0].produs).toBe(false);
    });

    it("pica un produs cu alt cuvant", () => {
      expect(comparaFactura(ASTEPTAT, cuLinie(1, { produs: "Pamant flori" })).linii[1].produs).toBe(false);
    });

    it("nu ignora diacriticele", () => {
      expect(comparaFactura(ASTEPTAT, cuLinie(1, { produs: "Pământ pentru flori" })).linii[1].produs).toBe(false);
    });
  });

  describe("cui", () => {
    it("ignora prefixul RO, spatiile si majusculele", () => {
      for (const cui of ["45187325", "ro45187325", "RO 4518 7325", " Ro45187325 "]) {
        expect(comparaFactura(ASTEPTAT, obtinut({ cui })).factura.cui, cui).toBe(true);
      }
    });

    it("ignora prefixul RO si cand lipseste din valoarea asteptata", () => {
      expect(comparaFactura({ ...ASTEPTAT, cui: "45187325" }, obtinut()).factura.cui).toBe(true);
    });

    it("pica un cui cu o cifra diferita", () => {
      expect(comparaFactura(ASTEPTAT, obtinut({ cui: "RO45187326" })).factura.cui).toBe(false);
    });

    it("pica un cui diferit doar la prima cifra", () => {
      expect(comparaFactura(ASTEPTAT, obtinut({ cui: "RO55187325" })).factura.cui).toBe(false);
    });

    it("pica un cui cu alt prefix decat RO", () => {
      expect(comparaFactura(ASTEPTAT, obtinut({ cui: "CUI45187325" })).factura.cui).toBe(false);
    });
  });

  describe("data", () => {
    it("trece doar la sir identic", () => {
      expect(comparaFactura(ASTEPTAT, obtinut({ data: "2026-10-14" })).factura.data).toBe(true);
    });

    it("pica aceeasi zi scrisa in alt format", () => {
      for (const data of ["14.10.2026", "2026-10-14 ", "2026/10/14", "2026-10-14T00:00:00Z"]) {
        expect(comparaFactura(ASTEPTAT, obtinut({ data })).factura.data, data).toBe(false);
      }
    });
  });

  describe("sume: total si pret, toleranta 0.01", () => {
    it("trece la diferenta de 0.01", () => {
      expect(comparaFactura(ASTEPTAT, obtinut({ total: 114.64 })).factura.total).toBe(true);
      expect(comparaFactura(ASTEPTAT, cuLinie(0, { pret: 45.49 })).linii[0].pret).toBe(true);
    });

    it("pica la diferenta de 0.015", () => {
      expect(comparaFactura(ASTEPTAT, obtinut({ total: 114.645 })).factura.total).toBe(false);
      expect(comparaFactura(ASTEPTAT, obtinut({ total: 114.615 })).factura.total).toBe(false);
      expect(comparaFactura(ASTEPTAT, cuLinie(0, { pret: 45.515 })).linii[0].pret).toBe(false);
    });

    it("trece o diferenta de 0.01 care in virgula mobila iese putin peste", () => {
      // |19.99 - 20| = 0.010000000000001563
      expect(comparaFactura({ ...ASTEPTAT, total: 19.99 }, obtinut({ total: 20 })).factura.total).toBe(true);
      expect(comparaFactura(ASTEPTAT, obtinut({ total: 0.1 + 0.2 })).factura.total).toBe(false);
      expect(comparaFactura({ ...ASTEPTAT, total: 0.3 }, obtinut({ total: 0.1 + 0.2 })).factura.total).toBe(true);
    });
  });

  describe("cantitate, toleranta 0.001", () => {
    it("trece la diferenta de 0.001, inclusiv cu zgomot de virgula mobila", () => {
      expect(comparaFactura(ASTEPTAT, cuLinie(1, { cantitate: 1.251 })).linii[1].cantitate).toBe(true);
      // |2.3 - 2.301| = 0.001000000000000334
      const asteptat = { ...ASTEPTAT, linii: [{ ...ASTEPTAT.linii[0], cantitate: 2.3 }, ASTEPTAT.linii[1]] };
      expect(comparaFactura(asteptat, cuLinie(0, { cantitate: 2.301 })).linii[0].cantitate).toBe(true);
    });

    it("pica la diferenta de 0.0015", () => {
      expect(comparaFactura(ASTEPTAT, cuLinie(1, { cantitate: 1.2515 })).linii[1].cantitate).toBe(false);
      expect(comparaFactura(ASTEPTAT, cuLinie(1, { cantitate: 1.2485 })).linii[1].cantitate).toBe(false);
    });

    it("nu foloseste toleranta sumelor pentru cantitate", () => {
      expect(comparaFactura(ASTEPTAT, cuLinie(1, { cantitate: 1.26 })).linii[1].cantitate).toBe(false);
    });
  });

  describe("linii", () => {
    it("cu mai putine linii: pica numarul de linii si toate controalele liniei lipsa", () => {
      const rezultat = comparaFactura(ASTEPTAT, obtinut({ linii: [ASTEPTAT.linii[0]] }));
      expect(rezultat.factura.linii).toBe(false);
      expect(rezultat.linii).toEqual([TOATE_LINIE, NICIUNA_LINIE]);
    });

    it("cu mai multe linii: pica doar numarul de linii", () => {
      const extra = { produs: "Bonus", cantitate: 1, pret: 0 };
      const rezultat = comparaFactura(ASTEPTAT, obtinut({ linii: [...ASTEPTAT.linii, extra] }));
      expect(rezultat.factura).toEqual({ furnizor: true, cui: true, data: true, total: true, linii: false });
      expect(rezultat.linii).toEqual([TOATE_LINIE, TOATE_LINIE]);
    });

    it("compara pe pozitie: liniile in alta ordine pica", () => {
      const rezultat = comparaFactura(ASTEPTAT, obtinut({ linii: [ASTEPTAT.linii[1], ASTEPTAT.linii[0]] }));
      expect(rezultat.factura.linii).toBe(true);
      expect(rezultat.linii).toEqual([NICIUNA_LINIE, NICIUNA_LINIE]);
    });
  });

  it("listeaza fiecare control picat cu valoarea asteptata si cea obtinuta", () => {
    const f = obtinut({ cui: "RO40862137", linii: [{ ...ASTEPTAT.linii[0], pret: 91 }] });
    expect(comparaFactura(ASTEPTAT, f).esecuri).toEqual([
      { control: "cui", asteptat: "RO45187325", obtinut: "RO40862137" },
      { control: "linii", asteptat: 2, obtinut: 1 },
      { control: "pret", linie: 1, asteptat: 45.5, obtinut: 91 },
      { control: "produs", linie: 2, asteptat: "Pamant pentru flori", obtinut: undefined },
      { control: "cantitate", linie: 2, asteptat: 1.25, obtinut: undefined },
      { control: "pret", linie: 2, asteptat: 18.9, obtinut: undefined },
    ]);
  });
});

describe("sumarEval", () => {
  const CU_O_LINIE: Factura = {
    furnizor: "Brutaria Test SRL",
    cui: "41528039",
    data: "2026-11-10",
    linii: [{ produs: "Covrigi", cantitate: 2, pret: 5.5 }],
    total: 11,
  };

  // 2 linii + 1 linie + 2 linii (esuata) = 5 linii asteptate; 3 facturi.
  const REZULTATE: RezultatFactura[] = [
    { fisier: "01.txt", asteptat: ASTEPTAT, obtinut: cuLinie(1, { pret: 1 }) },
    { fisier: "02.txt", asteptat: CU_O_LINIE, obtinut: structuredClone(CU_O_LINIE) },
    { fisier: "03.txt", asteptat: ASTEPTAT, eroare: "503 Service Unavailable" },
  ];

  it("numara controalele de factura peste facturi si pe cele de linie peste liniile asteptate", () => {
    const sumar = sumarEval(REZULTATE);
    expect(sumar.controale.furnizor).toEqual({ corecte: 2, total: 3, acuratete: 2 / 3 });
    expect(sumar.controale.linii).toEqual({ corecte: 2, total: 3, acuratete: 2 / 3 });
    expect(sumar.controale.produs).toEqual({ corecte: 3, total: 5, acuratete: 3 / 5 });
    expect(sumar.controale.pret).toEqual({ corecte: 2, total: 5, acuratete: 2 / 5 });
    expect(sumar.facturi).toBe(3);
  });

  it("numara facturile complet corecte si acuratetea totala", () => {
    const sumar = sumarEval(REZULTATE);
    // 3 facturi x 5 controale + 5 linii x 3 controale = 30; gresite: 1 pret + 5 + 6 la factura esuata = 12.
    expect(sumar.facturiComplete).toBe(1);
    expect(sumar.corecte).toBe(18);
    expect(sumar.totalControale).toBe(30);
    expect(sumar.acurateteTotala).toBe(18 / 30);
  });

  it("numara toate controalele unei extrageri esuate ca gresite si pastreaza eroarea", () => {
    const sumar = sumarEval([{ fisier: "03.txt", asteptat: ASTEPTAT, eroare: "timeout" }]);
    for (const scor of Object.values(sumar.controale)) expect(scor.corecte).toBe(0);
    expect(sumar.totalControale).toBe(5 + 2 * 3);
    expect(sumar.acurateteTotala).toBe(0);
    expect(sumar.detalii).toEqual([{ fisier: "03.txt", eroare: "timeout", esecuri: [] }]);
  });

  it("pastreaza esecurile fiecarei facturi in ordinea fisierelor", () => {
    const sumar = sumarEval(REZULTATE);
    expect(sumar.detalii.map((d) => d.fisier)).toEqual(["01.txt", "02.txt", "03.txt"]);
    expect(sumar.detalii[0].esecuri).toEqual([{ control: "pret", linie: 2, asteptat: 18.9, obtinut: 1 }]);
    expect(sumar.detalii[1].esecuri).toEqual([]);
  });

  it("intoarce acuratete 0 pentru un set gol", () => {
    const sumar = sumarEval([]);
    expect(sumar.controale.total).toEqual({ corecte: 0, total: 0, acuratete: 0 });
    expect(sumar.acurateteTotala).toBe(0);
    expect(sumar.facturiComplete).toBe(0);
  });
});
