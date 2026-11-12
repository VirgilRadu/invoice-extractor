import { describe, expect, it } from "vitest";
import type { Factura } from "../src/schema.js";
import { statusFactura, valideazaFactura, ziuaCalendaristica } from "../src/validare.js";

const AZI = "2026-11-12";

function factura(campuri: Partial<Factura> = {}): Factura {
  return {
    furnizor: "Florarie Test SRL",
    cui: "RO45187325",
    data: "2026-10-14",
    linii: [
      { produs: "Ghiveci", cantitate: 2, pret: 45.5 },
      { produs: "Pamant", cantitate: 3, pret: 18.9 },
    ],
    total: 147.7,
    ...campuri,
  };
}

const coduri = (f: Factura, azi = AZI) => valideazaFactura(f, azi).map(({ cod }) => cod);

describe("valideazaFactura", () => {
  it("intoarce lista goala pentru o factura corecta", () => {
    expect(valideazaFactura(factura(), AZI)).toEqual([]);
  });

  it("nu modifica factura primita", () => {
    const f = factura({ total: 1.08905, data: "2026-02-31", cui: "RO12A" });
    const copie = structuredClone(f);
    valideazaFactura(f, AZI);
    expect(f).toEqual(copie);
  });

  describe("suma_diferita", () => {
    const oLinie = (total: number, pret = 10) => factura({ linii: [{ produs: "X", cantitate: 1, pret }], total });

    it("trece la diferenta de 0.01, in ambele directii", () => {
      expect(coduri(oLinie(10.01))).toEqual([]);
      expect(coduri(oLinie(9.99))).toEqual([]);
    });

    it("pica la diferenta de 0.02 sau 0.011", () => {
      expect(coduri(oLinie(10.02))).toEqual(["suma_diferita"]);
      expect(coduri(oLinie(9.98))).toEqual(["suma_diferita"]);
      expect(coduri(oLinie(10.011))).toEqual(["suma_diferita"]);
    });

    it("trece o diferenta de 0.01 care in virgula mobila iese putin peste", () => {
      // |19.99 - 20| = 0.010000000000001563
      expect(coduri(oLinie(20, 19.99))).toEqual([]);
    });

    it("rotunjeste fiecare linie la 2 zecimale inainte de adunare", () => {
      // 1.5 x 0.99 = 1.485 -> 1.49 pe linie; 3 linii = 4.47 rotunjit, 4.455 nerotunjit.
      const linii = [1, 2, 3].map((n) => ({ produs: `P${n}`, cantitate: 1.5, pret: 0.99 }));
      expect(coduri(factura({ linii, total: 4.47 }))).toEqual([]);
      expect(coduri(factura({ linii, total: 4.45 }))).toEqual(["suma_diferita"]);
    });

    it("rotunjeste jumatatea in sus si cand produsul e stocat putin sub ea", () => {
      // 1 x 1.005 = 1.00499999999999989...: fara corectia de 1e-6 linia ar fi 1.00, nu 1.01.
      const linie = (cantitate: number, pret: number) => [{ produs: "X", cantitate, pret }];
      expect(coduri(factura({ linii: linie(1, 1.005), total: 1.02 }))).toEqual([]);
      expect(coduri(factura({ linii: linie(1, 1.005), total: 0.99 }))).toEqual(["suma_diferita"]);
      // 0.5 x 56.29 = 28.145 -> 28.15
      expect(coduri(factura({ linii: linie(0.5, 56.29), total: 28.16 }))).toEqual([]);
      expect(coduri(factura({ linii: linie(0.5, 56.29), total: 28.13 }))).toEqual(["suma_diferita"]);
    });

    it("trece bonul de carburant 42.37 x 7.89 = 334.30", () => {
      expect(coduri(factura({ linii: [{ produs: "MOTORINA", cantitate: 42.37, pret: 7.89 }], total: 334.3 }))).toEqual(
        [],
      );
    });

    it("numeste suma calculata si totalul in mesaj", () => {
      expect(valideazaFactura(factura({ total: 157.7 }), AZI)).toEqual([
        { cod: "suma_diferita", mesaj: "suma liniilor 147.70 difera de total 157.7" },
      ]);
    });

    it("scrie totalul exact cum a fost extras, nerotunjit", () => {
      const f = factura({ linii: [{ produs: "Ulei", cantitate: 1, pret: 1089.05 }], total: 1.08905 });
      expect(valideazaFactura(f, AZI)[0].mesaj).toBe("suma liniilor 1089.05 difera de total 1.08905");
    });
  });

  describe("fara_linii", () => {
    it("semnaleaza factura fara linii, fara sa mai compare suma", () => {
      expect(valideazaFactura(factura({ linii: [], total: 50 }), AZI)).toEqual([
        { cod: "fara_linii", mesaj: "factura nu are nicio linie" },
      ]);
      expect(coduri(factura({ linii: [], total: 0 }))).toEqual(["fara_linii"]);
    });
  });

  describe("data_invalida", () => {
    it("accepta 29 februarie doar in an bisect", () => {
      expect(coduri(factura({ data: "2028-02-29" }), "2028-03-01")).toEqual([]);
      expect(coduri(factura({ data: "2026-02-29" }))).toEqual(["data_invalida"]);
    });

    it("trateaza anii de secol: 2000 bisect (divizibil cu 400), 2100 nu", () => {
      expect(coduri(factura({ data: "2000-02-29" }))).toEqual([]);
      expect(coduri(factura({ data: "2100-02-29" }), "2100-03-01")).toEqual(["data_invalida"]);
    });

    it("respinge o zi care nu exista, chiar daca Date ar muta-o in martie", () => {
      expect(new Date("2026-02-31").toISOString().slice(0, 10)).toBe("2026-03-03");
      expect(coduri(factura({ data: "2026-02-31" }))).toEqual(["data_invalida"]);
      expect(coduri(factura({ data: "2026-04-31" }))).toEqual(["data_invalida"]);
      expect(coduri(factura({ data: "2026-10-00" }))).toEqual(["data_invalida"]);
    });

    it("respinge luna 13 si luna 00", () => {
      expect(coduri(factura({ data: "2026-13-01" }))).toEqual(["data_invalida"]);
      expect(coduri(factura({ data: "2026-00-10" }))).toEqual(["data_invalida"]);
    });

    it("respinge alt format decat YYYY-MM-DD si sirul gol", () => {
      for (const data of ["14.10.2026", "", "2026-1-05", "2026-10-14T00:00:00Z", " 2026-10-14", "2026/10/14"]) {
        expect(coduri(factura({ data })), data).toEqual(["data_invalida"]);
      }
    });

    it("accepta ultima zi a fiecarei luni", () => {
      for (const data of ["2026-01-31", "2026-02-28", "2026-04-30", "2026-06-30", "2026-09-30", "2026-10-31"]) {
        expect(coduri(factura({ data })), data).toEqual([]);
      }
    });

    it("numeste data in mesaj", () => {
      expect(valideazaFactura(factura({ data: "2026-02-31" }), AZI)).toEqual([
        { cod: "data_invalida", mesaj: 'data "2026-02-31" nu este o data reala in formatul YYYY-MM-DD' },
      ]);
    });
  });

  describe("data_in_viitor", () => {
    it("accepta aceeasi zi si respinge ziua urmatoare", () => {
      expect(coduri(factura({ data: "2026-11-12" }))).toEqual([]);
      expect(valideazaFactura(factura({ data: "2026-11-13" }), AZI)).toEqual([
        { cod: "data_in_viitor", mesaj: "data 2026-11-13 este dupa 2026-11-12" },
      ]);
    });

    it("compara zile calendaristice peste granita de an", () => {
      expect(coduri(factura({ data: "2026-12-31" }), "2027-01-01")).toEqual([]);
      expect(coduri(factura({ data: "2027-01-01" }), "2026-12-31")).toEqual(["data_in_viitor"]);
    });

    it("nu mai verifica viitorul pentru o data invalida", () => {
      expect(coduri(factura({ data: "2027-02-30" }))).toEqual(["data_invalida"]);
    });

    it("arunca eroare cand ziua de referinta nu e o data reala", () => {
      expect(() => valideazaFactura(factura(), "12.11.2026")).toThrow(/12\.11\.2026/);
      expect(() => valideazaFactura(factura(), "2026-02-31")).toThrow(/2026-02-31/);
    });
  });

  describe("cui_format", () => {
    it("accepta RO, ro, Ro, spatii si cifre simple", () => {
      for (const cui of ["RO45187325", "ro45187325", "Ro45187325", "45187325", "RO 4518 7325", " 45187325 "]) {
        expect(coduri(factura({ cui })), cui).toEqual([]);
      }
    });

    it("accepta 2 cifre si 10 cifre", () => {
      expect(coduri(factura({ cui: "19" }))).toEqual([]);
      expect(coduri(factura({ cui: "RO60" }))).toEqual([]);
      expect(coduri(factura({ cui: "1234567897" }))).not.toContain("cui_format");
    });

    it("respinge o litera, o cifra, 11 cifre, sirul gol si RO fara cifre", () => {
      for (const cui of ["RO4518732O", "RO45187325X", "1", "RO1", "45187325123", "", "RO", "ROAB", "R045187325x"]) {
        expect(coduri(factura({ cui })), cui).toEqual(["cui_format"]);
      }
    });

    it("respinge CUI-ul care incepe cu 0, chiar daca cifra de control s-ar potrivi", () => {
      for (const cui of ["00", "RO00", "0000000019", "RO 045187325", "01"]) {
        expect(coduri(factura({ cui })), cui).toEqual(["cui_format"]);
      }
    });

    it("respinge alt prefix sau semne de punctuatie", () => {
      for (const cui of ["CUI45187325", "RO-45187325", "RORO45187325", "45.187.325", "+45187325"]) {
        expect(coduri(factura({ cui })), cui).toEqual(["cui_format"]);
      }
    });

    it("numeste CUI-ul in mesaj", () => {
      expect(valideazaFactura(factura({ cui: "RO45187325123" }), AZI)).toEqual([
        { cod: "cui_format", mesaj: 'CUI "RO45187325123" nu are formatul RO optional + 2-10 cifre, prima diferita de 0' },
      ]);
    });
  });

  describe("cui_cifra_control", () => {
    it("accepta CUI-uri reale din setul de date", () => {
      for (const cui of ["RO45187325", "21945678", "33928174", "215476", "RO30657194", "39146282"]) {
        expect(coduri(factura({ cui })), cui).toEqual([]);
      }
    });

    it("accepta cifra de control 0 cand calculul da 10", () => {
      // 1675930 x 3217532: suma 111, 1110 mod 11 = 10 -> 0
      expect(coduri(factura({ cui: "RO16759300" }))).toEqual([]);
      expect(coduri(factura({ cui: "10000130" }))).toEqual([]);
    });

    it("respinge orice alta cifra de control", () => {
      for (const ultima of "012346789") {
        expect(coduri(factura({ cui: `RO4518732${ultima}` })), ultima).toEqual(["cui_cifra_control"]);
      }
      expect(coduri(factura({ cui: "RO16759301" }))).toEqual(["cui_cifra_control"]);
      expect(coduri(factura({ cui: "18" }))).toEqual(["cui_cifra_control"]);
    });

    it("aliniaza cheia la dreapta pentru 10 cifre", () => {
      // 123456789 x 753217532 = 7+10+9+8+5+42+35+24+18 = 158; 1580 mod 11 = 7
      expect(coduri(factura({ cui: "1234567897" }))).toEqual([]);
      expect(coduri(factura({ cui: "1234567890" }))).toEqual(["cui_cifra_control"]);
    });

    it("numeste CUI-ul si cifra asteptata in mesaj", () => {
      expect(valideazaFactura(factura({ cui: "RO45187326" }), AZI)).toEqual([
        { cod: "cui_cifra_control", mesaj: 'CUI "RO45187326" are cifra de control 6, calculul da 5' },
      ]);
    });
  });

  it("intoarce toate problemele, in ordine stabila: linii, data, CUI", () => {
    const f = factura({ cui: "RO45187326", data: "2026-12-01", total: 1 });
    expect(coduri(f)).toEqual(["suma_diferita", "data_in_viitor", "cui_cifra_control"]);
    expect(coduri(factura({ linii: [], data: "14.10.2026", cui: "X" }))).toEqual([
      "fara_linii",
      "data_invalida",
      "cui_format",
    ]);
  });
});

describe("statusFactura", () => {
  it("este ok fara probleme si de_verificat cu cel putin una", () => {
    expect(statusFactura([])).toBe("ok");
    expect(statusFactura([{ cod: "fara_linii", mesaj: "factura nu are nicio linie" }])).toBe("de_verificat");
  });
});

describe("ziuaCalendaristica", () => {
  it("scrie ziua locala ca YYYY-MM-DD, oricat de tarziu ar fi in zi", () => {
    expect(ziuaCalendaristica(new Date(2026, 10, 12, 0, 0, 1))).toBe("2026-11-12");
    expect(ziuaCalendaristica(new Date(2026, 10, 12, 23, 59, 59))).toBe("2026-11-12");
    expect(ziuaCalendaristica(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
