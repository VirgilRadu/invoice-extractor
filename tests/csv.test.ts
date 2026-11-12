import { describe, expect, it } from "vitest";
import { inCsv } from "../src/csv.js";
import type { Factura } from "../src/schema.js";

const ANTET = "fisier,furnizor,cui,data,produs,cantitate,pret,total\n";

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

describe("inCsv", () => {
  it("scrie doar antetul cand nu are facturi", () => {
    expect(inCsv([])).toBe(ANTET);
  });

  it("scrie un rand pe linie, cu campurile facturii repetate", () => {
    const f = factura({
      linii: [
        { produs: "Ghiveci", cantitate: 2, pret: 45.5 },
        { produs: "Pamant", cantitate: 3, pret: 18.9 },
      ],
      total: 147.7,
    });
    expect(inCsv([{ fisier: "01.txt", factura: f }])).toBe(
      ANTET +
        "01.txt,Florarie Test SRL,RO45187325,2026-10-14,Ghiveci,2,45.5,147.7\n" +
        "01.txt,Florarie Test SRL,RO45187325,2026-10-14,Pamant,3,18.9,147.7\n",
    );
  });

  it("pune ghilimele cand furnizorul contine virgula", () => {
    const f = factura({ furnizor: "Flori, Ghivece SRL" });
    expect(inCsv([{ fisier: "01.txt", factura: f }])).toBe(
      ANTET + '01.txt,"Flori, Ghivece SRL",RO45187325,2026-10-14,Ghiveci,2,45.5,91\n',
    );
  });

  it("pune ghilimele si dubleaza ghilimelele din produs", () => {
    const f = factura({ linii: [{ produs: 'Vaza "Clasic"', cantitate: 1, pret: 30 }], total: 30 });
    expect(inCsv([{ fisier: "01.txt", factura: f }])).toBe(
      ANTET + '01.txt,Florarie Test SRL,RO45187325,2026-10-14,"Vaza ""Clasic""",1,30,30\n',
    );
  });

  it("pune ghilimele cand un camp contine linie noua", () => {
    const f = factura({ furnizor: "Florarie\nTest SRL" });
    expect(inCsv([{ fisier: "01.txt", factura: f }])).toBe(
      ANTET + '01.txt,"Florarie\nTest SRL",RO45187325,2026-10-14,Ghiveci,2,45.5,91\n',
    );
  });

  it("pune ghilimele cand un camp contine retur de car", () => {
    const f = factura({ furnizor: "Florarie\rTest SRL" });
    expect(inCsv([{ fisier: "01.txt", factura: f }])).toBe(
      ANTET + '01.txt,"Florarie\rTest SRL",RO45187325,2026-10-14,Ghiveci,2,45.5,91\n',
    );
  });

  it("nu scrie niciun rand pentru o factura fara linii", () => {
    const goala = factura({ linii: [], total: 0 });
    const plina = factura();
    expect(
      inCsv([
        { fisier: "01.txt", factura: goala },
        { fisier: "02.txt", factura: plina },
      ]),
    ).toBe(ANTET + "02.txt,Florarie Test SRL,RO45187325,2026-10-14,Ghiveci,2,45.5,91\n");
  });

  it("scrie zecimalele cu punct", () => {
    const f = factura({ linii: [{ produs: "Pamant", cantitate: 1.25, pret: 18.9 }], total: 23.63 });
    expect(inCsv([{ fisier: "01.txt", factura: f }])).toBe(
      ANTET + "01.txt,Florarie Test SRL,RO45187325,2026-10-14,Pamant,1.25,18.9,23.63\n",
    );
  });
});
