import { describe, expect, it } from "vitest";
import type { Factura } from "../../src/schema.js";
import type { RulareSalvata } from "../../src/eval/comparatie.js";
import { cauzaEsec, raportComparatie, rezumatRulare, type RulareNotata } from "../../src/eval/raport-comparatie.js";
import { noteazaSetul, type FacturaSet } from "../../src/eval/ruleaza.js";

const LITE = "gemini-3.5-flash-lite";
const FALS = "model-fals";
const PREVIEW = "gemini-3-flash-preview";

const UNU: Factura = {
  furnizor: "Flori Unu SRL",
  cui: "RO45187325",
  data: "2026-10-14",
  linii: [
    { produs: "Ghiveci", cantitate: 2, pret: 45.5 },
    { produs: "Pamant", cantitate: 3, pret: 18.9 },
  ],
  total: 147.7,
};
const DOI: Factura = {
  furnizor: "Papetaria Doi SRL",
  cui: "21945678",
  data: "2026-09-01",
  linii: [{ produs: "Caiet", cantitate: 4, pret: 7.25 }],
  total: 29,
};
const TREI: Factura = { ...DOI, furnizor: "Tamplaria Trei SRL", data: "2026-11-20" };

// 3 facturi, 4 linii, 27 controale; 03 este gresita (data dupa ziua de referinta).
const SET: FacturaSet[] = [
  { fisier: "01.pdf", text: "", asteptat: UNU, coduriAsteptate: [] },
  { fisier: "02.pdf", text: "", asteptat: DOI, coduriAsteptate: [] },
  { fisier: "03.pdf", text: "", asteptat: TREI, coduriAsteptate: ["data_in_viitor"] },
];

const extrasa = (fisier: string, factura: Factura, latentaMs: number, model: string, tokeni = { intrare: 1000, iesire: 200 }) => ({
  fisier,
  factura,
  tokeni,
  latentaMs,
  model,
  dinRezerva: false,
});
const salvata = (model: string, rulare: number, inceput: string, facturi: RulareSalvata["facturi"]): RulareSalvata => ({
  provider: "gemini",
  model,
  rulare,
  inceput,
  intrare: "date/pdf (PDF)",
  dataReferinta: "2026-11-12",
  reincercari: 2,
  pauzaMs: 4500,
  facturi,
});

// lite #1 totul corect; lite #2 un total gresit si un 503; model-fals fara pret; preview cu doua 429.
const SALVATE: RulareSalvata[] = [
  salvata(LITE, 1, "2026-11-19T15:40:00.000Z", [
    extrasa("01.pdf", UNU, 1000, LITE),
    extrasa("02.pdf", DOI, 2000, LITE),
    extrasa("03.pdf", TREI, 9000, LITE),
  ]),
  salvata(LITE, 2, "2026-11-19T16:05:00.000Z", [
    extrasa("01.pdf", { ...UNU, total: 1 }, 1500, LITE),
    { fisier: "02.pdf", eroare: "503 Service Unavailable" },
    extrasa("03.pdf", TREI, 2500, LITE),
  ]),
  salvata(FALS, 1, "2026-11-19T15:45:00.000Z", [
    extrasa("01.pdf", UNU, 500, FALS),
    extrasa("02.pdf", DOI, 700, FALS),
    extrasa("03.pdf", TREI, 600, FALS),
  ]),
  salvata(PREVIEW, 1, "2026-11-19T15:50:00.000Z", [
    extrasa("01.pdf", UNU, 30000, PREVIEW, { intrare: 1000, iesire: 500 }),
    { fisier: "02.pdf", eroare: "429 quota" },
    { fisier: "03.pdf", eroare: "429 quota" },
  ]),
];

const noteaza = (salvate: RulareSalvata[]): RulareNotata[] =>
  salvate.map((s) => ({ salvata: s, eval: noteazaSetul(SET, s.facturi, "2026-11-12") }));
const NOTATE = noteaza(SALVATE);
const META = { rezultateBrute: "comparatie/<model>-<n>.json" };
const RAPORT = raportComparatie(NOTATE, META);

const RULARI_ANTET = "| Masura | gemini-3.5-flash-lite #1 | gemini-3.5-flash-lite #2 | model-fals #1 | gemini-3-flash-preview #1 |\n|---|---|---|---|---|";

// Aceleasi rulari, dar lite #2 citeste corect 01: pe facturile extrase totul e corect, raman doar extragerile esuate.
const CURATE = noteaza([SALVATE[0], { ...SALVATE[1], facturi: [extrasa("01.pdf", UNU, 1500, LITE), ...SALVATE[1].facturi.slice(1)] }, SALVATE[2], SALVATE[3]]);

describe("raportComparatie", () => {
  it("spune ca sunt modele ale aceluiasi provider, nu provideri diferiti, si cum s-a rulat", () => {
    expect(RAPORT).toContain(
      [
        "# Comparatie intre modele",
        "",
        "- Compara modele ale aceluiasi provider (gemini), nu provideri diferiti",
        "- Intrare: date/pdf (PDF): 3 facturi, 27 controale pe rulare",
        "- Data de referinta pentru validare: 2026-11-12",
        "- Fiecare model are extractorul lui, fara rezerva, cu aceleasi reincercari la toate rularile: maxRetries 2",
      ].join("\n"),
    );
    expect(RAPORT).toContain("- Latenta: doar extragerile reusite; include reincercarile, care nu sunt inregistrate separat\n");
    expect(RAPORT).toContain(
      "- Extragerile esuate, dupa eroarea salvata: 503 = provider indisponibil, 429 = cota depasita, alta = orice alta eroare\n",
    );
    expect(RAPORT).toContain("- Rezultatele fiecarei rulari, factura cu factura: comparatie/<model>-<n>.json; `pnpm compara:raport`");
  });

  it("numeste providerii cand rularile vin de la mai multi", () => {
    const amestec = noteaza([SALVATE[0], { ...SALVATE[2], provider: "ollama" }]);
    expect(raportComparatie(amestec, META)).toContain("- Rularile vin de la mai multi provideri: gemini, ollama\n");
  });

  describe("constatarea, calculata din date", () => {
    it("cand pe facturile extrase totul e corect, spune ca diferentele vin din extragerile esuate, pe cauze", () => {
      expect(raportComparatie(CURATE, META)).toContain(
        "## Constatare\n\n" +
          "Pe facturile extrase fiecare rulare are 100% controale corecte si validarea exacta; " +
          "toate diferentele vin din extragerile esuate (1 x 503, 2 x 429).\n",
      );
    });

    it("cand un model citeste gresit, numeste rularea, controalele gresite si validarea diferita", () => {
      expect(RAPORT).toContain(
        "## Constatare\n\n" +
          "Pe facturile extrase nu toate rularile sunt corecte: gemini-3.5-flash-lite #2 are 1 controale gresite din 19 " +
          "si 1 facturi cu validarea diferita de cea asteptata; celelalte rulari au 100% controale corecte si validarea exacta. " +
          "Extrageri esuate: 1 x 503, 2 x 429.\n",
      );
    });

    it("fara extrageri esuate si fara greseli, spune ca rularile nu separa modelele dupa acuratete", () => {
      expect(raportComparatie(noteaza([SALVATE[0], SALVATE[2]]), META)).toContain(
        "## Constatare\n\n" +
          "Fiecare rulare are 100% controale corecte si validarea exacta, fara extrageri esuate: " +
          "rularile nu separa modelele dupa acuratete.\n",
      );
    });

    it("numeste rularile fara nicio factura extrasa si cauza unei erori necunoscute", () => {
      const esuata = salvata(FALS, 1, "2026-11-19T15:45:00.000Z", SET.map(({ fisier }) => ({ fisier, eroare: "fetch failed: timeout" })));
      expect(raportComparatie(noteaza([SALVATE[0], esuata]), META)).toContain(
        "Pe facturile extrase fiecare rulare are 100% controale corecte si validarea exacta; " +
          "toate diferentele vin din extragerile esuate (3 x alta). Fara nicio factura extrasa: model-fals #1.\n",
      );
    });
  });

  it("scrie fiecare rulare in coloana ei: extrase, esuate pe cauze, acuratete pe extrase si din toate, tokeni si cost pe factura extrasa", () => {
    expect(RAPORT).toContain(
      [
        "## Fiecare rulare",
        "",
        RULARI_ANTET,
        "| Inceput | 2026-11-19 15:40 UTC | 2026-11-19 16:05 UTC | 2026-11-19 15:45 UTC | 2026-11-19 15:50 UTC |",
        "| Facturi extrase | 3/3 | 2/3 | 3/3 | 1/3 |",
        "| Extrageri esuate | 0/3 | 1/3 (1 x 503) | 0/3 | 2/3 (2 x 429) |",
        "| Controale corecte, pe extrase | 27/27 (100.0%) | 18/19 (94.7%) | 27/27 (100.0%) | 11/11 (100.0%) |",
        "| Controale corecte, din toate | 27/27 | 18/27 | 27/27 | 11/27 |",
        "| Facturi complet corecte, din extrase | 3/3 | 1/2 | 3/3 | 1/1 |",
        "| Facturi complet corecte, din toate | 3/3 | 1/3 | 3/3 | 1/3 |",
        "| Tokeni intrare pe factura extrasa | 1000 | 1000 | 1000 | 1000 |",
        "| Tokeni iesire pe factura extrasa | 200 | 200 | 200 | 500 |",
        // lite: 1000 x 0.30 + 200 x 2.50 = 800 / 1M; preview: 1000 x 0.50 + 500 x 3.00 = 2000 / 1M (randul gemini-3-flash)
        "| Cost pe factura extrasa | $0.000800 | $0.000800 | pret necunoscut | $0.002000 |",
        "| Tokeni intrare, total | 3000 | 2000 | 3000 | 1000 |",
        "| Tokeni iesire, total | 600 | 400 | 600 | 500 |",
        "| Cost total | $0.002400 | $0.001600 | pret necunoscut | $0.002000 |",
        "| Latenta medie | 4.0 s | 2.0 s | 0.6 s | 30.0 s |",
        "| Latenta mediana | 2.0 s | 2.0 s | 0.6 s | 30.0 s |",
        "| Latenta maxima | 9.0 s | 2.5 s | 0.7 s | 30.0 s |",
      ].join("\n"),
    );
  });

  it("da validarea pe facturile extrase, cu cate au ramas neextrase, si din toate facturile", () => {
    expect(RAPORT).toContain(
      [
        "## Validare, fiecare rulare",
        "",
        "Pe facturile extrase se vede validarea; o factura neextrasa nu a ajuns la validare.",
        "",
        RULARI_ANTET,
        "| Gresite semnalate, din cele extrase | 1/1 | 1/1 | 1/1 | 0/0 (neextrase: 1) |",
        "| Corecte lasate ok, din cele extrase | 2/2 | 0/1 (neextrase: 1) | 2/2 | 1/1 (neextrase: 1) |",
        "| Coduri exacte, din cele extrase | 3/3 | 1/2 | 3/3 | 1/1 |",
        "| Gresite semnalate, din toate | 1/1 | 1/1 | 1/1 | 0/1 |",
        "| Corecte lasate ok, din toate | 2/2 | 0/2 | 2/2 | 1/2 |",
      ].join("\n"),
    );
  });

  it("scrie pret necunoscut si liniuta la o rulare fara pret in care toate extragerile au esuat", () => {
    const esuata = salvata(FALS, 1, "2026-11-19T15:45:00.000Z", SET.map(({ fisier }) => ({ fisier, eroare: "503" })));
    const raport = raportComparatie(noteaza([esuata]), META);
    expect(raport).toContain("| Controale corecte, pe extrase | - |\n");
    expect(raport).toContain("| Cost pe factura extrasa | pret necunoscut |\n| Tokeni intrare, total | 0 |");
    expect(raport).toContain("| Cost total | pret necunoscut |\n");
    expect(raport).toContain("| Latenta medie | - |\n");
    expect(raport).toContain("| furnizor | - |\n");
  });

  it("da acuratetea pe camp pe facturile extrase, apoi controalele corecte din toate facturile", () => {
    const antet = "| Camp | gemini-3.5-flash-lite #1 | gemini-3.5-flash-lite #2 | model-fals #1 | gemini-3-flash-preview #1 |\n|---|---|---|---|---|";
    expect(RAPORT).toContain(
      [
        "## Acuratete pe camp, pe facturile extrase",
        "",
        "Controale corecte din controalele facturilor extrase; extragerile esuate nu intra aici.",
        "",
        antet,
        "| furnizor | 100.0% (3/3) | 100.0% (2/2) | 100.0% (3/3) | 100.0% (1/1) |",
        "| cui | 100.0% (3/3) | 100.0% (2/2) | 100.0% (3/3) | 100.0% (1/1) |",
        "| data | 100.0% (3/3) | 100.0% (2/2) | 100.0% (3/3) | 100.0% (1/1) |",
        "| total | 100.0% (3/3) | 50.0% (1/2) | 100.0% (3/3) | 100.0% (1/1) |",
        "| linii | 100.0% (3/3) | 100.0% (2/2) | 100.0% (3/3) | 100.0% (1/1) |",
        "| produs | 100.0% (4/4) | 100.0% (3/3) | 100.0% (4/4) | 100.0% (2/2) |",
        "| cantitate | 100.0% (4/4) | 100.0% (3/3) | 100.0% (4/4) | 100.0% (2/2) |",
        "| pret | 100.0% (4/4) | 100.0% (3/3) | 100.0% (4/4) | 100.0% (2/2) |",
        "",
        "## Controale corecte pe camp, din toate facturile",
        "",
        "O extragere esuata are toate controalele gresite, deci aici scad si extragerile esuate.",
        "",
        antet,
        "| furnizor | 3/3 | 2/3 | 3/3 | 1/3 |",
        "| cui | 3/3 | 2/3 | 3/3 | 1/3 |",
        "| data | 3/3 | 2/3 | 3/3 | 1/3 |",
        "| total | 3/3 | 1/3 | 3/3 | 1/3 |",
        "| linii | 3/3 | 2/3 | 3/3 | 1/3 |",
        "| produs | 4/4 | 3/4 | 4/4 | 2/4 |",
        "| cantitate | 4/4 | 3/4 | 4/4 | 2/4 |",
        "| pret | 4/4 | 3/4 | 4/4 | 2/4 |",
      ].join("\n"),
    );
  });

  it("pune alaturi rularile unui model cu doua rulari, cu toate masurile, fara sa aleaga una", () => {
    expect(RAPORT).toContain(
      [
        "## gemini-3.5-flash-lite",
        "",
        "- Pret: randul `gemini-3.5-flash-lite` din src/lib/cost.ts: $0.30 / 1M tokeni intrare, $2.50 / 1M tokeni iesire",
        "- Rulari: 2, alaturate mai jos",
        "",
        "| Masura | Rulare 1 | Rulare 2 |",
        "|---|---|---|",
        "| Inceput | 2026-11-19 15:40 UTC | 2026-11-19 16:05 UTC |",
        "| Facturi extrase | 3/3 | 2/3 |",
      ].join("\n"),
    );
    expect(RAPORT).toContain("| Cost pe factura extrasa | $0.000800 | $0.000800 |\n");
    expect(RAPORT).toContain("| Corecte lasate ok, din cele extrase | 2/2 | 0/1 (neextrase: 1) |\n");
    expect(RAPORT).not.toMatch(/cea mai buna|best/i);
  });

  it("numeste randul de pret al fiecarui model: prefixul pentru preview, necunoscut pentru un model fara rand", () => {
    expect(RAPORT).toContain(
      "## gemini-3-flash-preview\n\n" +
        "- Pret: randul `gemini-3-flash` din src/lib/cost.ts (cel mai lung prefix al numelui): " +
        "$0.50 / 1M tokeni intrare, $3.00 / 1M tokeni iesire\n" +
        "- Rulari: 1; variatia de la o rulare la alta nu se vede\n",
    );
    expect(RAPORT).toContain(
      "## model-fals\n\n" +
        '- Pret: necunoscut, modelul nu are rand in src/lib/cost.ts; costul se scrie "pret necunoscut", nu zero\n',
    );
    expect(RAPORT).not.toMatch(/\| model-fals #1 \|[^\n]*\| (n\/a|\$0\.000000) \|/);
  });

  it("listeaza, pe fiecare rulare, controalele gresite, extragerile esuate si validarea diferita de cea asteptata", () => {
    expect(RAPORT).toContain(
      [
        "### gemini-3.5-flash-lite, rularea 1",
        "",
        "- Toate facturile extrase, toate controalele corecte, validarea cu codurile asteptate la fiecare factura",
        "",
        "### gemini-3.5-flash-lite, rularea 2",
        "",
        "- 01.pdf:",
        "  - total: asteptat 147.7, obtinut 1",
        "- 02.pdf: extragere esuata: 503 Service Unavailable",
        "- Validare diferita de cea asteptata:",
        "  - 01.pdf: corecta, semnalata: validarea a prins o valoare extrasa gresit (coduri asteptate: -, obtinute: suma_diferita)",
        "",
      ].join("\n"),
    );
  });

  it("scurteaza in raport o eroare lunga; mesajul intreg ramane in rularea salvata", () => {
    const lung = `429 ${"x".repeat(400)}`;
    const cuEroare = salvata(PREVIEW, 1, "2026-11-19T15:50:00.000Z", SET.map(({ fisier }) => ({ fisier, eroare: lung })));
    const raport = raportComparatie(noteaza([cuEroare]), META);
    expect(raport).toContain(`- 01.pdf: extragere esuata: ${lung.slice(0, 200)} ...\n`);
    expect(raport).not.toContain(lung);
  });

  describe("ce poate si ce nu poate separa o rulare", () => {
    const sectiune = (raport: string) => raport.slice(raport.indexOf("## Ce poate si ce nu poate separa o rulare"), raport.indexOf("## Fiecare rulare"));

    it("spune ca totalul amesteca citirea cu disponibilitatea si da variatia pe extrase, cu sursa ei", () => {
      expect(sectiune(RAPORT)).toContain(
        "- O rulare are 3 facturi si 27 controale. O extragere esuata are toate controalele ei gresite, deci controalele din " +
          "toate facturile amesteca citirea cu disponibilitatea; acuratetea se citeste pe facturile extrase.\n" +
          "- Cat variaza acelasi model de la o rulare la alta (o diferenta intre modele care nu trece de aceasta variatie nu le separa):\n" +
          "  - gemini-3.5-flash-lite: 27 si 18 controale corecte din 27; pe facturile extrase 27/27 si 18/19; " +
          "extrageri esuate 0 si 1; diferenta vine si din extragerile esuate, si din citiri gresite\n" +
          "- Cu o singura rulare variatia nu se vede: model-fals, gemini-3-flash-preview.\n",
      );
      expect(sectiune(raportComparatie(CURATE, META))).toContain(
        "  - gemini-3.5-flash-lite: 27 si 19 controale corecte din 27; pe facturile extrase 27/27 si 19/19; " +
          "extrageri esuate 0 si 1; toata diferenta vine din extragerile esuate\n",
      );
    });

    it("spune cand diferenta vine doar din citiri gresite sau cand rularile au acelasi rezultat", () => {
      const doarCitire = noteaza([SALVATE[0], { ...SALVATE[0], rulare: 2, facturi: [extrasa("01.pdf", { ...UNU, total: 1 }, 1, LITE), ...SALVATE[0].facturi.slice(1)] }]);
      expect(sectiune(raportComparatie(doarCitire, META))).toContain("; toata diferenta vine din citiri gresite\n");
      const la_fel = noteaza([SALVATE[0], { ...SALVATE[0], rulare: 2 }]);
      expect(sectiune(raportComparatie(la_fel, META))).toContain("; rularile au acelasi rezultat\n");
    });

    it("da granularitatea validarii, esecurile pe cauze, latenta mediana pe model si costul pe factura extrasa", () => {
      const text = sectiune(RAPORT);
      expect(text).toContain("- Validarea are 1 facturi gresite si 2 corecte: o singura factura muta rezultatul cu 100.0%, respectiv 50.0%.\n");
      expect(text).toContain(
        "- Extragerile esuate (1 x 503, 2 x 429 in toate rularile) arata cat de disponibil a fost modelul la ora rularii, " +
          "nu cat de bine extrage.\n",
      );
      expect(text).toContain(
        "- Latenta mediana a aceluiasi model de la o rulare la alta: gemini-3.5-flash-lite 2.0 s si 2.0 s. " +
          "Latenta depinde de ora rularii si include reincercarile, care nu sunt inregistrate separat.\n",
      );
      expect(text).toContain(
        "- O factura esuata nu are tokeni, deci costul total scade cu extragerile esuate; costul se compara pe factura extrasa.\n",
      );
    });

    it("nu mai are propozitiile pe care datele nu le sustin", () => {
      for (const raport of [RAPORT, raportComparatie(CURATE, META)]) {
        expect(raport).not.toContain("zgomot");
        expect(raport).not.toContain("o reincercare adauga secunde");
        expect(raport).not.toContain("tokenii de gandire");
      }
    });

    it("spune cand niciun model nu are doua rulari", () => {
      expect(sectiune(raportComparatie(noteaza([SALVATE[0], SALVATE[3]]), META))).toContain(
        "- Niciun model nu are doua rulari, deci variatia de la o rulare la alta nu se vede.\n",
      );
    });
  });

  it("numeste reincercarile fiecarei rulari cand nu sunt aceleasi", () => {
    const diferite = noteaza([SALVATE[0], { ...SALVATE[1], reincercari: 6 }]);
    expect(raportComparatie(diferite, META)).toContain(
      "- Fiecare model are extractorul lui, fara rezerva; reincercarile difera intre rulari: " +
        "gemini-3.5-flash-lite #1: maxRetries 2, gemini-3.5-flash-lite #2: maxRetries 6\n",
    );
  });
});

describe("cauzaEsec", () => {
  it("citeste cauza din eroarea salvata: 503, 429 sau alta", () => {
    expect(cauzaEsec("[GoogleGenerativeAI Error]: ... [503 Service Unavailable] high demand")).toBe("503");
    expect(cauzaEsec("[429 Too Many Requests] You exceeded your current quota")).toBe("429");
    expect(cauzaEsec("fetch failed: timeout")).toBe("alta");
    expect(cauzaEsec("Raspunsul modelului nu respecta schema: total 5030")).toBe("alta");
  });
});

describe("rezumatRulare", () => {
  it("scrie pe un rand masurile rularii", () => {
    expect(rezumatRulare(NOTATE[1])).toBe(
      "gemini-3.5-flash-lite #2: facturi extrase 2/3, extrageri esuate 1/3 (1 x 503), controale corecte, pe extrase 18/19 (94.7%), " +
        "controale corecte, din toate 18/27, facturi complet corecte, din extrase 1/2, facturi complet corecte, din toate 1/3, " +
        "tokeni intrare pe factura extrasa 1000, tokeni iesire pe factura extrasa 200, cost pe factura extrasa $0.000800, " +
        "tokeni intrare, total 2000, tokeni iesire, total 400, cost total $0.001600, latenta medie 2.0 s, latenta mediana 2.0 s, " +
        "latenta maxima 2.5 s, gresite semnalate, din cele extrase 1/1, corecte lasate ok, din cele extrase 0/1 (neextrase: 1), " +
        "coduri exacte, din cele extrase 1/2, gresite semnalate, din toate 1/1, corecte lasate ok, din toate 0/2",
    );
  });
});
