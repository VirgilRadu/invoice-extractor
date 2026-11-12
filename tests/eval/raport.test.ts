import { describe, expect, it } from "vitest";
import { sumarEval } from "../../src/eval/compara.js";
import { sumarConsum, type ConsumFactura } from "../../src/eval/consum.js";
import { raportEval, sectiuneCost, sectiuneValidare, tabelCampuri } from "../../src/eval/raport.js";
import { sumarValidare } from "../../src/eval/validare.js";
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
const FLASH = "gemini-3-flash-preview";

// Aceleasi 3 facturi: 01 si 02 extrase cu gemini-3.5-flash-lite (0.30 / 2.50 la 1M tokeni), 03 esuata.
const RANDURI: ConsumFactura[] = [
  { fisier: "01.txt", corecte: 11, controale: 11, tokeni: { intrare: 1000, iesire: 200 }, latentaMs: 1500.4, model: LITE, dinRezerva: false },
  { fisier: "02.txt", corecte: 9, controale: 11, tokeni: { intrare: 2000, iesire: 400 }, latentaMs: 2499.6, model: LITE, dinRezerva: false },
  { fisier: "03.txt", corecte: 0, controale: 11, tokeni: { intrare: 0, iesire: 0 }, latentaMs: null, model: null, dinRezerva: false },
];
const CONSUM = sumarConsum(RANDURI);
const META = { principal: LITE, rezerva: FLASH, dataRulare: "2026-11-12" };

// Aceleasi 3 facturi: 01 lasata ok, 02 corecta dar semnalata dupa o citire gresita, 03 gresita si esuata.
const VALIDARE = sumarValidare(
  [
    { fisier: "01.txt", asteptate: [], obtinute: [] },
    { fisier: "02.txt", asteptate: [], obtinute: ["cui_cifra_control"] },
    { fisier: "03.txt", asteptate: ["suma_diferita"], obtinute: null },
  ],
  "2026-11-12",
);

const SECTIUNE_VALIDARE = [
  "## Validare",
  "",
  "- Data de referinta: 2026-11-12, fixa pentru setul de date, ca codurile asteptate sa ramana adevarate " +
    "oricand ar fi rulat eval-ul (pnpm start foloseste data curenta)",
  "- Facturi gresite semnalate: 0 din 1",
  "- Facturi corecte lasate ok: 1 din 2",
  "  - din celelalte 1: 0 extrageri esuate (nevalidate), 1 semnalate",
  "- Facturi cu exact codurile asteptate: 1 din 3",
  "- O factura corecta semnalata are o valoare extrasa gresit, prinsa de validare. " +
    "O extragere esuata nu este numarata nici semnalata, nici ok.",
  "",
  "| Fisier | Coduri asteptate | Coduri obtinute | Rezultat |",
  "|---|---|---|---|",
  "| 01.txt | - | - | corecta, lasata ok |",
  "| 02.txt | - | cui_cifra_control | corecta, semnalata: validarea a prins o valoare extrasa gresit |",
  "| 03.txt | suma_diferita | n/a | extragere esuata, nevalidata |",
].join("\n");

// 01: 1000 x 0.30 + 200 x 2.50 = 800 / 1M; 02: 2000 x 0.30 + 400 x 2.50 = 1600 / 1M; medie pe 2 extrase.
const SECTIUNE_COST = [
  "## Tokeni, cost si latenta",
  "",
  "- Tokeni intrare: 3000",
  "- Tokeni iesire: 600",
  "- Cost total: $0.002400",
  "- Cost mediu pe factura extrasa: $0.001200 (2 extrase din 3)",
  "- Latenta medie: 2000 ms, maxima: 2500 ms (doar extragerile reusite; timpul include reincercarile si trecerea pe rezerva)",
  "- Facturi la care a raspuns rezerva (gemini-3-flash-preview): 0 din 2 extrase",
  "- Pret folosit pentru gemini-3.5-flash-lite (2 facturi, 3000 tokeni intrare / 600 iesire): " +
    "$0.30 / 1M tokeni intrare, $2.50 / 1M tokeni iesire (src/lib/cost.ts)",
  "- Costul este calculat la pretul de lista al nivelului platit; rularea a fost facuta pe nivelul gratuit.",
  "",
  "| Fisier | Model | Controale corecte | Tokeni intrare | Tokeni iesire | Latenta (ms) | Cost |",
  "|---|---|---|---|---|---|---|",
  "| 01.txt | gemini-3.5-flash-lite | 11/11 | 1000 | 200 | 1500 | $0.000800 |",
  "| 02.txt | gemini-3.5-flash-lite | 9/11 | 2000 | 400 | 2500 | $0.001600 |",
  "| 03.txt | - | 0/11 | 0 | 0 | - | n/a |",
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
    expect(raportEval(SUMAR, CONSUM, VALIDARE, META)).toBe(
      [
        "# Eval extractor facturi",
        "",
        "- Model principal: gemini-3.5-flash-lite",
        "- Model de rezerva: gemini-3-flash-preview",
        "- Data rularii: 2026-11-12",
        "- Facturi: 3",
        "- Facturi complet corecte: 1 din 3",
        "- Acuratete totala: 60.6% (20 din 33 controale)",
        "- Extrageri esuate: 1 din 3 (provider picat sau raspuns respins; controalele lor sunt numarate gresite mai sus)",
        "- Acuratete pe facturile extrase: 90.9% (20 din 22 controale, 2 facturi)",
        "",
        "## Acuratete pe camp",
        "",
        TABEL,
        "",
        SECTIUNE_VALIDARE,
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
    const raport = raportEval(sumar, sumarConsum([RANDURI[0]]), VALIDARE, META);
    expect(raport).toContain("  - linii: asteptat 2, obtinut 1\n");
    expect(raport).toContain('  - linia 2, produs: asteptat "Paine \\"Casa\\"", obtinut lipsa\n');
  });

  it("scrie o eroare pe mai multe randuri pe un singur rand", () => {
    const sumar = sumarEval([{ fisier: "05.txt", asteptat: FACTURA, eroare: "schema:\n  total lipseste" }]);
    expect(raportEval(sumar, sumarConsum([RANDURI[2]]), VALIDARE, META)).toContain(
      "- 05.txt: extragere esuata: schema: total lipseste\n",
    );
  });

  it("spune ca pretul e necunoscut cand modelul nu are rand in cost.ts, in loc de un cost 0", () => {
    const randuri = RANDURI.map((r) => (r.model === null ? r : { ...r, model: "model-fals" }));
    const meta = { principal: "model-fals", rezerva: null, dataRulare: "2026-11-12" };
    const raport = raportEval(SUMAR, sumarConsum(randuri), VALIDARE, meta);
    expect(raport).toContain("- Cost total: pret necunoscut\n");
    expect(raport).toContain("- Cost mediu pe factura extrasa: pret necunoscut (2 extrase din 3)\n");
    expect(raport).toContain(
      "- Pret folosit pentru model-fals (2 facturi, 3000 tokeni intrare / 600 iesire): " +
        "necunoscut, modelul nu are rand in src/lib/cost.ts\n",
    );
    expect(raport).toContain("| 01.txt | model-fals | 11/11 | 1000 | 200 | 1500 | pret necunoscut |\n");
    expect(raport).not.toMatch(/Cost total: (n\/a|\$0)/);
  });

  it("spune in antet cate extrageri au esuat, ca esecurile providerului sa nu para greseli ale modelului", () => {
    const sumar = sumarEval([
      { fisier: "01.txt", asteptat: FACTURA, obtinut: structuredClone(FACTURA) },
      { fisier: "02.txt", asteptat: FACTURA, eroare: "p: 503; r: 429" },
      { fisier: "03.txt", asteptat: FACTURA, eroare: "p: 503; r: 429" },
    ]);
    const raport = raportEval(sumar, CONSUM, VALIDARE, META);
    expect(raport).toContain(
      "- Acuratete totala: 33.3% (11 din 33 controale)\n" +
        "- Extrageri esuate: 2 din 3 (provider picat sau raspuns respins; controalele lor sunt numarate gresite mai sus)\n" +
        "- Acuratete pe facturile extrase: 100.0% (11 din 11 controale, 1 facturi)\n",
    );
  });

  it("scrie liniuta la acuratetea pe facturile extrase cand nicio extragere nu a reusit", () => {
    const sumar = sumarEval([{ fisier: "01.txt", asteptat: FACTURA, eroare: "503" }]);
    expect(raportEval(sumar, CONSUM, VALIDARE, META)).toContain(
      "- Extrageri esuate: 1 din 1 (provider picat sau raspuns respins; controalele lor sunt numarate gresite mai sus)\n" +
        "- Acuratete pe facturile extrase: - (nicio factura extrasa)\n",
    );
  });

  it("scrie liniuta la cost mediu si latenta cand toate extragerile au esuat", () => {
    const raport = raportEval(SUMAR, sumarConsum([RANDURI[2]]), VALIDARE, META);
    expect(raport).toContain("- Cost mediu pe factura extrasa: - (0 extrase din 1)\n");
    expect(raport).toContain(
      "- Latenta medie: -, maxima: - (doar extragerile reusite; timpul include reincercarile si trecerea pe rezerva)\n",
    );
  });
});

describe("sectiuneCost cu principal si rezerva", () => {
  // 01 si 04 de principal, 02 de rezerva dupa ce principalul a picat, 03 esuata la amandoi.
  const randuri: ConsumFactura[] = [
    { fisier: "01.txt", corecte: 11, controale: 11, tokeni: { intrare: 1000, iesire: 200 }, latentaMs: 1500, model: LITE, dinRezerva: false },
    { fisier: "02.txt", corecte: 9, controale: 11, tokeni: { intrare: 2000, iesire: 400 }, latentaMs: 9000, model: FLASH, dinRezerva: true },
    { fisier: "03.txt", corecte: 0, controale: 11, tokeni: { intrare: 0, iesire: 0 }, latentaMs: null, model: null, dinRezerva: false },
    { fisier: "04.txt", corecte: 8, controale: 8, tokeni: { intrare: 500, iesire: 100 }, latentaMs: 1000, model: LITE, dinRezerva: false },
  ];

  // 01: 1000 x 0.30 + 200 x 2.50 = 800; 02: 2000 x 0.50 + 400 x 3.00 = 2200; 04: 150 + 250 = 400 (pe 1M tokeni).
  it("pune pe fiecare rand modelul care a raspuns si il taxeaza cu pretul lui", () => {
    expect(sectiuneCost(sumarConsum(randuri), META)).toBe(
      [
        "## Tokeni, cost si latenta",
        "",
        "- Tokeni intrare: 3500",
        "- Tokeni iesire: 700",
        "- Cost total: $0.003400",
        "- Cost mediu pe factura extrasa: $0.001133 (3 extrase din 4)",
        "- Latenta medie: 3833 ms, maxima: 9000 ms (doar extragerile reusite; timpul include reincercarile si trecerea pe rezerva)",
        "- Facturi la care a raspuns rezerva (gemini-3-flash-preview): 1 din 3 extrase",
        "- Pret folosit pentru gemini-3.5-flash-lite (2 facturi, 1500 tokeni intrare / 300 iesire): " +
          "$0.30 / 1M tokeni intrare, $2.50 / 1M tokeni iesire (src/lib/cost.ts)",
        "- Pret folosit pentru gemini-3-flash-preview (1 facturi, 2000 tokeni intrare / 400 iesire): " +
          "$0.50 / 1M tokeni intrare, $3.00 / 1M tokeni iesire (src/lib/cost.ts)",
        "- Costul este calculat la pretul de lista al nivelului platit; rularea a fost facuta pe nivelul gratuit.",
        "",
        "| Fisier | Model | Controale corecte | Tokeni intrare | Tokeni iesire | Latenta (ms) | Cost |",
        "|---|---|---|---|---|---|---|",
        "| 01.txt | gemini-3.5-flash-lite | 11/11 | 1000 | 200 | 1500 | $0.000800 |",
        "| 02.txt | gemini-3-flash-preview | 9/11 | 2000 | 400 | 9000 | $0.002200 |",
        "| 03.txt | - | 0/11 | 0 | 0 | - | n/a |",
        "| 04.txt | gemini-3.5-flash-lite | 8/8 | 500 | 100 | 1000 | $0.000400 |",
      ].join("\n"),
    );
  });

  it("are costul total egal cu suma randurilor, fiecare la pretul modelului sau", () => {
    const consum = sumarConsum(randuri);
    expect(consum.cost).toBeCloseTo((800 + 2200 + 400) / 1_000_000, 15);
    expect(consum.cost).toBe(consum.facturi.reduce((acc, f) => acc + (f.cost ?? Number.NaN), 0));
  });

  it("numeste in antet principalul si rezerva, sau spune ca nu are rezerva", () => {
    const sumar = sumarEval([{ fisier: "01.txt", asteptat: FACTURA, obtinut: FACTURA }]);
    const consum = sumarConsum([RANDURI[0]]);
    expect(raportEval(sumar, consum, VALIDARE, META)).toContain(
      "- Model principal: gemini-3.5-flash-lite\n- Model de rezerva: gemini-3-flash-preview\n",
    );
    const faraRezerva = raportEval(sumar, consum, VALIDARE, { ...META, rezerva: null });
    expect(faraRezerva).toContain("- Model principal: gemini-3.5-flash-lite\n- Model de rezerva: fara rezerva\n");
    expect(faraRezerva).not.toContain("Facturi la care a raspuns rezerva");
  });

  it("numara fiecare factura la care a raspuns rezerva, si cand rezerva are numele principalului", () => {
    const rezerva = (fisier: string): ConsumFactura => ({ ...randuri[0], fisier, dinRezerva: true });
    const consum = sumarConsum([rezerva("01.txt"), randuri[3], rezerva("05.txt"), rezerva("06.txt")]);
    expect(sectiuneCost(consum, { principal: LITE, rezerva: LITE })).toContain(
      "- Facturi la care a raspuns rezerva (gemini-3.5-flash-lite): 3 din 4 extrase\n",
    );
  });

  it("scrie pretul principalului cand niciun model nu a raspuns", () => {
    expect(sectiuneCost(sumarConsum([RANDURI[2]]), META)).toContain(
      "- Facturi la care a raspuns rezerva (gemini-3-flash-preview): 0 din 0 extrase\n" +
        "- Pret folosit pentru gemini-3.5-flash-lite (0 facturi, 0 tokeni intrare / 0 iesire): ",
    );
  });
});

describe("sectiuneValidare, corectele care nu au ramas ok", () => {
  it("le imparte in extrageri esuate (nevalidate) si semnalate", () => {
    const validare = sumarValidare(
      [
        { fisier: "01.txt", asteptate: [], obtinute: [] },
        { fisier: "02.txt", asteptate: [], obtinute: null },
        { fisier: "03.txt", asteptate: [], obtinute: null },
        { fisier: "04.txt", asteptate: [], obtinute: ["suma_diferita"] },
        { fisier: "05.txt", asteptate: ["suma_diferita"], obtinute: null },
      ],
      "2026-11-12",
    );
    expect(sectiuneValidare(validare)).toContain(
      "- Facturi corecte lasate ok: 1 din 4\n  - din celelalte 3: 2 extrageri esuate (nevalidate), 1 semnalate\n",
    );
  });
});

describe("sectiuneValidare", () => {
  it("scrie fiecare verdict cu codurile asteptate si obtinute, in ordinea fisierelor", () => {
    const validare = sumarValidare(
      [
        { fisier: "14.txt", asteptate: [], obtinute: ["suma_diferita"] },
        { fisier: "16.txt", asteptate: ["suma_diferita"], obtinute: ["suma_diferita"] },
        { fisier: "19.txt", asteptate: ["cui_format"], obtinute: ["cui_cifra_control"] },
        { fisier: "20.txt", asteptate: ["suma_diferita", "data_in_viitor"], obtinute: [] },
      ],
      "2026-11-12",
    );
    const sectiune = sectiuneValidare(validare);
    expect(sectiune).toContain("- Facturi gresite semnalate: 2 din 3\n");
    expect(sectiune).toContain("- Facturi corecte lasate ok: 0 din 1\n  - din celelalte 1: 0 extrageri esuate (nevalidate), 1 semnalate\n");
    expect(sectiune).toContain("- Facturi cu exact codurile asteptate: 1 din 4\n");
    expect(sectiune.split("\n").slice(-4)).toEqual([
      "| 14.txt | - | suma_diferita | corecta, semnalata: validarea a prins o valoare extrasa gresit |",
      "| 16.txt | suma_diferita | suma_diferita | gresita, semnalata cu codurile asteptate |",
      "| 19.txt | cui_format | cui_cifra_control | gresita, semnalata cu alte coduri |",
      "| 20.txt | suma_diferita, data_in_viitor | - | gresita, nesemnalata |",
    ]);
  });
});
