import { describe, expect, it } from "vitest";
import { sumarEval } from "../../src/eval/compara.js";
import { sumarConsum, type ConsumFactura } from "../../src/eval/consum.js";
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

const LITE = "gemini-3.5-flash-lite";

// Aceleasi 3 facturi: 01 si 02 extrase cu gemini-3.5-flash-lite (0.30 / 2.50 la 1M tokeni), 03 esuata.
const RANDURI: ConsumFactura[] = [
  { fisier: "01.txt", corecte: 11, controale: 11, tokeni: { intrare: 1000, iesire: 200 }, latentaMs: 1500.4, model: LITE },
  { fisier: "02.txt", corecte: 9, controale: 11, tokeni: { intrare: 2000, iesire: 400 }, latentaMs: 2499.6, model: LITE },
  { fisier: "03.txt", corecte: 0, controale: 11, tokeni: { intrare: 0, iesire: 0 }, latentaMs: null, model: null },
];
const CONSUM = sumarConsum(RANDURI);
const META = { model: LITE, dataRulare: "2026-11-12" };

// 01: 1000 x 0.30 + 200 x 2.50 = 800 / 1M; 02: 2000 x 0.30 + 400 x 2.50 = 1600 / 1M; medie pe 2 extrase.
const SECTIUNE_COST = [
  "## Tokeni, cost si latenta",
  "",
  "- Tokeni intrare: 3000",
  "- Tokeni iesire: 600",
  "- Cost total: $0.002400",
  "- Cost mediu pe factura extrasa: $0.001200 (2 extrase din 3)",
  "- Latenta medie: 2000 ms, maxima: 2500 ms (doar extragerile reusite)",
  "- Pret folosit pentru gemini-3.5-flash-lite: $0.30 / 1M tokeni intrare, $2.50 / 1M tokeni iesire (src/lib/cost.ts)",
  "- Costul este calculat la pretul de lista al nivelului platit; rularea a fost facuta pe nivelul gratuit.",
  "",
  "| Fisier | Controale corecte | Tokeni intrare | Tokeni iesire | Latenta (ms) | Cost |",
  "|---|---|---|---|---|---|",
  "| 01.txt | 11/11 | 1000 | 200 | 1500 | $0.000800 |",
  "| 02.txt | 9/11 | 2000 | 400 | 2500 | $0.001600 |",
  "| 03.txt | 0/11 | 0 | 0 | - | n/a |",
].join("\n");

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
    expect(raportEval(SUMAR, CONSUM, META)).toBe(
      [
        "# Eval extractor facturi",
        "",
        "- Model: gemini-3.5-flash-lite",
        "- Data rularii: 2026-11-12",
        "- Facturi: 3",
        "- Facturi complet corecte: 1 din 3",
        "- Acuratete totala: 60.6% (20 din 33 controale)",
        "",
        "## Acuratete pe camp",
        "",
        TABEL,
        "",
        SECTIUNE_COST,
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
    const raport = raportEval(sumar, sumarConsum([RANDURI[0]]), META);
    expect(raport).toContain("  - linii: asteptat 2, obtinut 1\n");
    expect(raport).toContain('  - linia 2, produs: asteptat "Paine \\"Casa\\"", obtinut lipsa\n');
  });

  it("scrie o eroare pe mai multe randuri pe un singur rand", () => {
    const sumar = sumarEval([{ fisier: "05.txt", asteptat: FACTURA, eroare: "schema:\n  total lipseste" }]);
    expect(raportEval(sumar, sumarConsum([RANDURI[2]]), META)).toContain(
      "- 05.txt: extragere esuata: schema: total lipseste\n",
    );
  });

  it("spune ca pretul e necunoscut cand modelul nu are rand in cost.ts, in loc de un cost 0", () => {
    const randuri = RANDURI.map((r) => (r.model === null ? r : { ...r, model: "model-fals" }));
    const raport = raportEval(SUMAR, sumarConsum(randuri), { model: "model-fals", dataRulare: "2026-11-12" });
    expect(raport).toContain("- Cost total: pret necunoscut\n");
    expect(raport).toContain("- Cost mediu pe factura extrasa: pret necunoscut (2 extrase din 3)\n");
    expect(raport).toContain("- Pret folosit pentru model-fals: necunoscut, modelul nu are rand in src/lib/cost.ts\n");
    expect(raport).toContain("| 01.txt | 11/11 | 1000 | 200 | 1500 | pret necunoscut |\n");
    expect(raport).not.toMatch(/Cost total: (n\/a|\$0)/);
  });

  it("scrie liniuta la cost mediu si latenta cand toate extragerile au esuat", () => {
    const raport = raportEval(SUMAR, sumarConsum([RANDURI[2]]), META);
    expect(raport).toContain("- Cost mediu pe factura extrasa: - (0 extrase din 1)\n");
    expect(raport).toContain("- Latenta medie: -, maxima: - (doar extragerile reusite)\n");
  });
});
