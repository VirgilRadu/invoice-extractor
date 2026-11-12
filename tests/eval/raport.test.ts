import { describe, expect, it } from "vitest";
import { sumarEval } from "../../src/eval/compara.js";
import { raportEval, tabelCampuri } from "../../src/eval/raport.js";
import type { Factura } from "../../src/schema.js";

const FACTURA: Factura = {
  furnizor: "Brutaria Test SRL",
  cui: "RO41528039",
  data: "2026-11-10",
  linii: [
    { produs: "Covrigi", cantitate: 2, pret: 5.5 },
    { produs: 'Paine "Casa"', cantitate: 1, pret: 9.8 },
  ],
  total: 20.8,
};

// 01 corecta, 02 cu cui si un pret gresite, 03 esuata: 3 facturi, 6 linii, 33 controale, 20 corecte.
const SUMAR = sumarEval([
  { fisier: "01.txt", asteptat: FACTURA, obtinut: structuredClone(FACTURA) },
  {
    fisier: "02.txt",
    asteptat: FACTURA,
    obtinut: { ...FACTURA, cui: "RO15082734", linii: [FACTURA.linii[0], { ...FACTURA.linii[1], pret: 98 }] },
  },
  { fisier: "03.txt", asteptat: FACTURA, eroare: "503 Service Unavailable" },
]);

const TABEL = [
  "| Camp | Corecte | Total | Acuratete |",
  "|---|---|---|---|",
  "| furnizor | 2 | 3 | 66.7% |",
  "| cui | 1 | 3 | 33.3% |",
  "| data | 2 | 3 | 66.7% |",
  "| total | 2 | 3 | 66.7% |",
  "| linii | 2 | 3 | 66.7% |",
  "| produs | 4 | 6 | 66.7% |",
  "| cantitate | 4 | 6 | 66.7% |",
  "| pret | 3 | 6 | 50.0% |",
].join("\n");

describe("tabelCampuri", () => {
  it("scrie acuratetea pe fiecare camp, controalele de factura apoi cele de linie", () => {
    expect(tabelCampuri(SUMAR)).toBe(TABEL);
  });
});

describe("raportEval", () => {
  it("scrie raportul complet", () => {
    expect(raportEval(SUMAR, { model: "model-fals", dataRulare: "2026-11-12" })).toBe(
      [
        "# Eval extractor facturi",
        "",
        "- Model: model-fals",
        "- Data rularii: 2026-11-12",
        "- Facturi: 3",
        "- Facturi complet corecte: 1 din 3",
        "- Acuratete totala: 60.6% (20 din 33 controale)",
        "",
        "## Acuratete pe camp",
        "",
        TABEL,
        "",
        "## Rezultat pe factura",
        "",
        "- 01.txt: toate controalele corecte",
        "- 02.txt:",
        '  - cui: asteptat "RO41528039", obtinut "RO15082734"',
        "  - linia 2, pret: asteptat 9.8, obtinut 98",
        "- 03.txt: extragere esuata: 503 Service Unavailable",
        "",
      ].join("\n"),
    );
  });

  it("scrie o linie lipsa ca valoare absenta si textul cu ghilimele escapate", () => {
    const sumar = sumarEval([{ fisier: "04.txt", asteptat: FACTURA, obtinut: { ...FACTURA, linii: [FACTURA.linii[0]] } }]);
    const raport = raportEval(sumar, { model: "m", dataRulare: "2026-11-12" });
    expect(raport).toContain("  - linii: asteptat 2, obtinut 1\n");
    expect(raport).toContain('  - linia 2, produs: asteptat "Paine \\"Casa\\"", obtinut lipsa\n');
  });

  it("scrie o eroare pe mai multe randuri pe un singur rand", () => {
    const sumar = sumarEval([{ fisier: "05.txt", asteptat: FACTURA, eroare: "schema:\n  total lipseste" }]);
    expect(raportEval(sumar, { model: "m", dataRulare: "2026-11-12" })).toContain(
      "- 05.txt: extragere esuata: schema: total lipseste\n",
    );
  });
});
