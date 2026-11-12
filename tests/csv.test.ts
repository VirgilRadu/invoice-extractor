import { describe, expect, it } from "vitest";
import { inCsv } from "../src/csv.js";
import type { Factura } from "../src/schema.js";
import type { Problema } from "../src/validare.js";

const ANTET = "fisier,furnizor,cui,data,produs,cantitate,pret,total,status,probleme\n";

function factura(campuri: Partial<Factura> = {}): Factura {
  return {
    furnizor: "Florarie Test SRL",
    cui: "RO45187325",
    data: "2026-10-14",
    linii: [{ produs: "Ghiveci", cantitate: 2, pret: 45.5 }],
    total: 91,
    ...campuri,
  };
}

const SUMA: Problema = { cod: "suma_diferita", mesaj: "suma liniilor 91.00 difera de total 92" };
const DATA: Problema = { cod: "data_in_viitor", mesaj: "data 2026-12-01 este dupa 2026-11-12" };

describe("inCsv", () => {
  it("scrie doar antetul cand nu are facturi", () => {
    expect(inCsv([])).toBe(ANTET);
  });

  it("scrie un rand pe linie, cu campurile facturii, statusul si problemele repetate", () => {
    const f = factura({
      linii: [
        { produs: "Ghiveci", cantitate: 2, pret: 45.5 },
        { produs: "Pamant", cantitate: 3, pret: 18.9 },
      ],
      total: 147.7,
    });
    expect(inCsv([{ fisier: "01.txt", factura: f, probleme: [] }])).toBe(
      ANTET +
        "01.txt,Florarie Test SRL,RO45187325,2026-10-14,Ghiveci,2,45.5,147.7,ok,\n" +
        "01.txt,Florarie Test SRL,RO45187325,2026-10-14,Pamant,3,18.9,147.7,ok,\n",
    );
  });

  it("marcheaza de_verificat si uneste problemele cu '; '", () => {
    const f = factura({ data: "2026-12-01", total: 92 });
    expect(inCsv([{ fisier: "01.txt", factura: f, probleme: [SUMA, DATA] }])).toBe(
      ANTET +
        "01.txt,Florarie Test SRL,RO45187325,2026-12-01,Ghiveci,2,45.5,92,de_verificat," +
        "suma liniilor 91.00 difera de total 92; data 2026-12-01 este dupa 2026-11-12\n",
    );
  });

  it("scrie un rand cu campurile de linie goale pentru o factura fara linii", () => {
    const goala = factura({ linii: [], total: 50 });
    const fara: Problema = { cod: "fara_linii", mesaj: "factura nu are nicio linie" };
    expect(
      inCsv([
        { fisier: "01.txt", factura: goala, probleme: [fara] },
        { fisier: "02.txt", factura: factura(), probleme: [] },
      ]),
    ).toBe(
      ANTET +
        "01.txt,Florarie Test SRL,RO45187325,2026-10-14,,,,50,de_verificat,factura nu are nicio linie\n" +
        "02.txt,Florarie Test SRL,RO45187325,2026-10-14,Ghiveci,2,45.5,91,ok,\n",
    );
  });

  it("scrie un rand doar cu fisierul, statusul si problema pentru o extragere esuata", () => {
    const esuata: Problema = { cod: "extragere_esuata", mesaj: "extragere esuata: 503 Service Unavailable" };
    expect(inCsv([{ fisier: "03.txt", factura: null, probleme: [esuata] }])).toBe(
      ANTET + "03.txt,,,,,,,,de_verificat,extragere esuata: 503 Service Unavailable\n",
    );
  });

  it("pune ghilimele cand eroarea unei extrageri esuate contine virgula", () => {
    const esuata: Problema = { cod: "extragere_esuata", mesaj: "extragere esuata: 503, high demand" };
    expect(inCsv([{ fisier: "03.txt", factura: null, probleme: [esuata] }])).toBe(
      ANTET + '03.txt,,,,,,,,de_verificat,"extragere esuata: 503, high demand"\n',
    );
  });

  it("pune ghilimele cand o problema contine virgula sau ghilimele", () => {
    const cui: Problema = { cod: "cui_format", mesaj: 'CUI "RO12,5" nu are formatul RO optional + 2-10 cifre' };
    expect(inCsv([{ fisier: "01.txt", factura: factura({ cui: "RO12,5" }), probleme: [cui] }])).toBe(
      ANTET +
        '01.txt,Florarie Test SRL,"RO12,5",2026-10-14,Ghiveci,2,45.5,91,de_verificat,' +
        '"CUI ""RO12,5"" nu are formatul RO optional + 2-10 cifre"\n',
    );
  });

  it("pune ghilimele cand furnizorul contine virgula", () => {
    const f = factura({ furnizor: "Flori, Ghivece SRL" });
    expect(inCsv([{ fisier: "01.txt", factura: f, probleme: [] }])).toBe(
      ANTET + '01.txt,"Flori, Ghivece SRL",RO45187325,2026-10-14,Ghiveci,2,45.5,91,ok,\n',
    );
  });

  it("pune ghilimele si dubleaza ghilimelele din produs", () => {
    const f = factura({ linii: [{ produs: 'Vaza "Clasic"', cantitate: 1, pret: 30 }], total: 30 });
    expect(inCsv([{ fisier: "01.txt", factura: f, probleme: [] }])).toBe(
      ANTET + '01.txt,Florarie Test SRL,RO45187325,2026-10-14,"Vaza ""Clasic""",1,30,30,ok,\n',
    );
  });

  it("pune ghilimele cand un camp contine linie noua", () => {
    const f = factura({ furnizor: "Florarie\nTest SRL" });
    expect(inCsv([{ fisier: "01.txt", factura: f, probleme: [] }])).toBe(
      ANTET + '01.txt,"Florarie\nTest SRL",RO45187325,2026-10-14,Ghiveci,2,45.5,91,ok,\n',
    );
  });

  it("pune ghilimele cand un camp contine retur de car", () => {
    const f = factura({ furnizor: "Florarie\rTest SRL" });
    expect(inCsv([{ fisier: "01.txt", factura: f, probleme: [] }])).toBe(
      ANTET + '01.txt,"Florarie\rTest SRL",RO45187325,2026-10-14,Ghiveci,2,45.5,91,ok,\n',
    );
  });

  it("scrie zecimalele cu punct si valorile exact cum au fost extrase", () => {
    const f = factura({ linii: [{ produs: "Pamant", cantitate: 1.25, pret: 18.9 }], total: 1.08905 });
    expect(inCsv([{ fisier: "01.txt", factura: f, probleme: [SUMA] }])).toBe(
      ANTET +
        "01.txt,Florarie Test SRL,RO45187325,2026-10-14,Pamant,1.25,18.9,1.08905,de_verificat," +
        "suma liniilor 91.00 difera de total 92\n",
    );
  });
});
