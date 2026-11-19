import { mkdir, mkdtemp, readdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Factura } from "../../src/schema.js";
import type { CodValidare } from "../../src/validare.js";
import { caiAsteptate, caiPentruSet, citesteSetul, DATA_REFERINTA_SET, noteazaSetul } from "../../src/eval/ruleaza.js";
import { raportComparatie, rezumatRulare } from "../../src/eval/raport-comparatie.js";
import {
  caiComparatie,
  comandaDinArgumente,
  creeazaModelComparatie,
  fisierRulare,
  listaComparatie,
  MODELE_COMPARATIE,
  ordineRulari,
  REINCERCARI_COMPARATIE,
  refaRaportul,
  ruleaza,
  ruleazaComparatia,
  type OptiuniComparatie,
  type OptiuniRulare,
  type RulareSalvata,
} from "../../src/eval/comparatie.js";
import { ModelCarePica, ModelDupaText } from "../modele-false.js";

// dotenv/config inlocuit: factory-ul ruleaza doar daca modulul e importat.
const dotenv = vi.hoisted(() => ({ incarcat: false }));
vi.mock("dotenv/config", () => {
  dotenv.incarcat = true;
  return {};
});

const LITE = "gemini-3.5-flash-lite";
const LITE_31 = "gemini-3.1-flash-lite";
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
// Data dupa ziua de referinta: factura gresita, data_in_viitor.
const TREI: Factura = { ...DOI, furnizor: "Tamplaria Trei SRL", data: "2026-11-20" };
const TEXTE = ["TEXT UNU", "TEXT DOI", "TEXT TREI"];

let dir: string;
let dirFacturi: string;
let dirAsteptat: string;
let fisierCoduriAsteptate: string;
let dirRulari: string;
let fisierRaport: string;
const dataReferinta = "2026-11-12";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "comparatie-"));
  dirFacturi = join(dir, "facturi");
  dirAsteptat = join(dir, "asteptat");
  fisierCoduriAsteptate = join(dir, "asteptat-validare.json");
  dirRulari = join(dir, "rezultate", "comparatie");
  fisierRaport = join(dir, "rezultate", "comparatie.md");
  await mkdir(dirFacturi);
  await mkdir(dirAsteptat);
  const coduri: Record<string, CodValidare[]> = {};
  for (const [nume, text, asteptat, asteptate] of [
    ["01", "TEXT UNU", UNU, []],
    ["02", "TEXT DOI", DOI, []],
    ["03", "TEXT TREI", TREI, ["data_in_viitor"]],
  ] as const) {
    await writeFile(join(dirFacturi, `${nume}.txt`), text);
    await writeFile(join(dirAsteptat, `${nume}.json`), JSON.stringify(asteptat));
    coduri[nume] = [...asteptate];
  }
  await writeFile(fisierCoduriAsteptate, JSON.stringify(coduri));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const raspuns = (parsed: Factura, intrare = 1000, iesire = 200) => ({
  raw: new AIMessage({ content: "", usage_metadata: { input_tokens: intrare, output_tokens: iesire, total_tokens: intrare + iesire } }),
  parsed,
});
const modelCorect = () => new ModelDupaText({ "TEXT UNU": raspuns(UNU), "TEXT DOI": raspuns(DOI), "TEXT TREI": raspuns(TREI) });

const optiuniRaport = () => ({ lista: MODELE_COMPARATIE, dirFacturi, dirAsteptat, fisierCoduriAsteptate, dataReferinta, dirRulari, fisierRaport });

// Optiunile comune; modelele false sunt date pe nume, testul schimba ce ii trebuie.
function optiuni(modele: Record<string, BaseChatModel>, alte: Partial<OptiuniComparatie> = {}): OptiuniComparatie {
  return {
    ...optiuniRaport(),
    provider: "gemini",
    creeazaModel: (nume) => {
      const model = modele[nume];
      if (!model) throw new Error(`model necunoscut in test: ${nume}`);
      return model;
    },
    reincercari: REINCERCARI_COMPARATIE,
    intrare: "set de test",
    pauzaMs: 0,
    log: vi.fn(),
    asteapta: async () => {},
    acum: () => new Date("2026-11-19T15:40:00.000Z"),
    ...alte,
  };
}

const citesteRulare = async (model: string, rulare: number) =>
  JSON.parse(await readFile(fisierRulare(dirRulari, { model, rulare }), "utf8")) as RulareSalvata;

describe("listaComparatie", () => {
  it("fara COMPARA_MODELE foloseste lista implicita: cele doua flash-lite cu 2 rulari, preview cu 1", () => {
    expect(MODELE_COMPARATIE).toEqual([
      { nume: LITE, rulari: 2 },
      { nume: LITE_31, rulari: 2 },
      { nume: PREVIEW, rulari: 1 },
    ]);
    for (const valoare of [undefined, "", "  "]) expect(listaComparatie(valoare)).toEqual(MODELE_COMPARATIE);
  });

  it("citeste model:rulari separate prin virgula; numele poate contine doua puncte", () => {
    expect(listaComparatie(" gpt-4o-mini:2 , qwen3:8b:1")).toEqual([
      { nume: "gpt-4o-mini", rulari: 2 },
      { nume: "qwen3:8b", rulari: 1 },
    ]);
  });

  it("arunca o eroare care numeste variabila la o valoare gresita sau un model repetat", () => {
    for (const gresita of ["gemini", "gemini:0", "gemini:x", "gemini:1.5", ":2", "gemini:1,", "a:1,a:2"]) {
      expect(() => listaComparatie(gresita), gresita).toThrow(/COMPARA_MODELE/);
    }
  });
});

describe("ordineRulari", () => {
  it("merge in runde: prima rulare a fiecarui model, apoi a doua, cate rulari are fiecare", () => {
    expect(ordineRulari(MODELE_COMPARATIE)).toEqual([
      { model: LITE, rulare: 1 },
      { model: LITE_31, rulare: 1 },
      { model: PREVIEW, rulare: 1 },
      { model: LITE, rulare: 2 },
      { model: LITE_31, rulare: 2 },
    ]);
    expect(ordineRulari([{ nume: "a", rulari: 1 }, { nume: "b", rulari: 3 }])).toEqual([
      { model: "a", rulare: 1 },
      { model: "b", rulare: 1 },
      { model: "b", rulare: 2 },
      { model: "b", rulare: 3 },
    ]);
  });
});

describe("comandaDinArgumente", () => {
  it("fara argument ruleaza tot, cu raport doar reface raportul, cu model si numar ruleaza doar acea rulare", () => {
    expect(comandaDinArgumente([], MODELE_COMPARATIE)).toEqual({ tip: "toate" });
    expect(comandaDinArgumente(["raport"], MODELE_COMPARATIE)).toEqual({ tip: "raport" });
    expect(comandaDinArgumente([LITE_31, "2"], MODELE_COMPARATIE)).toEqual({ tip: "una", rulare: { model: LITE_31, rulare: 2 } });
  });

  it("arunca la un model in afara listei, o rulare in afara numarului de rulari sau alte argumente", () => {
    for (const argumente of [["x"], [LITE_31, "3"], [PREVIEW, "2"], [LITE_31, "0"], [LITE_31, "1.5"], ["necunoscut", "1"], ["a", "b", "c"]]) {
      expect(() => comandaDinArgumente(argumente, MODELE_COMPARATIE), argumente.join(" ")).toThrow(/Argument/);
    }
  });
});

describe("creeazaModelComparatie", () => {
  // Fiecare test lasa process.env cum l-a gasit; cheia e falsa, constructorul nu face apeluri.
  const VARIABILE = ["GOOGLE_API_KEY", "GEMINI_MODEL", "LLM_FALLBACK_PROVIDER", "LLM_FALLBACK_MODEL"] as const;
  let salvate: Record<string, string | undefined>;
  beforeEach(() => {
    salvate = Object.fromEntries(VARIABILE.map((nume) => [nume, process.env[nume]]));
    for (const nume of VARIABILE) delete process.env[nume];
    process.env.GOOGLE_API_KEY = "cheie-de-test";
    process.env.GEMINI_MODEL = "alt-model-din-mediu";
  });
  afterEach(() => {
    for (const nume of VARIABILE) {
      if (salvate[nume] === undefined) delete process.env[nume];
      else process.env[nume] = salvate[nume];
    }
  });

  it("construieste fiecare model din lista cu numele lui si aceleasi reincercari, REINCERCARI_COMPARATIE = 2", () => {
    const creeaza = creeazaModelComparatie("gemini");
    for (const { nume } of MODELE_COMPARATIE) {
      const model = creeaza(nume) as unknown as { model: string; caller: { maxRetries: number } };
      expect(model.model).toBe(nume);
      expect(model.caller.maxRetries, nume).toBe(REINCERCARI_COMPARATIE);
    }
    expect(REINCERCARI_COMPARATIE).toBe(2);
  });
});

describe("caiComparatie", () => {
  it("foloseste setul PDF, valorile si codurile asteptate ale eval-ului si ziua de referinta a setului", () => {
    const cale = (relativ: string) => fileURLToPath(new URL(`../../${relativ}`, import.meta.url));
    const { dirFacturi, intrare } = caiPentruSet("pdf");
    expect(caiComparatie()).toEqual({
      dirFacturi,
      intrare,
      ...caiAsteptate(),
      dataReferinta: DATA_REFERINTA_SET,
      dirRulari: cale("rezultate/comparatie/"),
      fisierRaport: cale("rezultate/comparatie.md"),
    });
  });
});

describe("ruleazaComparatia", () => {
  it("trece fiecare model prin acelasi set, de cate ori cere lista, in runde, si salveaza fiecare rulare", async () => {
    const modele = { [LITE]: modelCorect(), [LITE_31]: modelCorect(), [PREVIEW]: modelCorect() };
    const log = vi.fn();

    await ruleazaComparatia(optiuni(modele, { log }));

    expect(modele[LITE].texte).toEqual([...TEXTE, ...TEXTE]);
    expect(modele[LITE_31].texte).toEqual([...TEXTE, ...TEXTE]);
    expect(modele[PREVIEW].texte).toEqual(TEXTE);
    expect((await readdir(dirRulari)).sort()).toEqual([
      `${PREVIEW}-1.json`,
      `${LITE_31}-1.json`,
      `${LITE_31}-2.json`,
      `${LITE}-1.json`,
      `${LITE}-2.json`,
    ]);
    const antete = log.mock.calls.map(([linie]) => String(linie)).filter((linie) => linie.includes("rularea"));
    expect(antete).toEqual([
      expect.stringContaining(`${LITE}, rularea 1 din 2`),
      expect.stringContaining(`${LITE_31}, rularea 1 din 2`),
      expect.stringContaining(`${PREVIEW}, rularea 1 din 1`),
      expect.stringContaining(`${LITE}, rularea 2 din 2`),
      expect.stringContaining(`${LITE_31}, rularea 2 din 2`),
    ]);
  });

  it("salveaza pentru fiecare factura valorile extrase, tokenii, latenta si modelul care a raspuns", async () => {
    await ruleazaComparatia(optiuni({ [LITE]: modelCorect(), [LITE_31]: modelCorect(), [PREVIEW]: modelCorect() }));

    const salvata = await citesteRulare(LITE_31, 2);
    expect(salvata).toEqual({
      provider: "gemini",
      model: LITE_31,
      rulare: 2,
      inceput: "2026-11-19T15:40:00.000Z",
      intrare: "set de test",
      dataReferinta,
      reincercari: REINCERCARI_COMPARATIE,
      pauzaMs: 0,
      facturi: [UNU, DOI, TREI].map((factura, index) => ({
        fisier: `0${index + 1}.txt`,
        factura,
        tokeni: { intrare: 1000, iesire: 200 },
        latentaMs: expect.any(Number),
        model: LITE_31,
        dinRezerva: false,
      })),
    });
  });

  it("nu foloseste rezerva: factura modelului care pica ramane esuata, niciun alt model nu raspunde la ea", async () => {
    const modele = {
      [LITE]: modelCorect(),
      [LITE_31]: new ModelCarePica(new Error("503 Service Unavailable: high demand")),
      [PREVIEW]: modelCorect(),
    };

    const { rulari } = await ruleazaComparatia(optiuni(modele));

    for (const rulare of [1, 2]) {
      expect((await citesteRulare(LITE_31, rulare)).facturi).toEqual([
        { fisier: "01.txt", eroare: "503 Service Unavailable: high demand" },
        { fisier: "02.txt", eroare: "503 Service Unavailable: high demand" },
        { fisier: "03.txt", eroare: "503 Service Unavailable: high demand" },
      ]);
    }
    expect(modele[LITE_31].apeluri).toBe(6);
    expect(modele[LITE].texte).toHaveLength(6);
    expect(modele[PREVIEW].texte).toHaveLength(3);
    for (const { salvata } of rulari) {
      for (const factura of salvata.facturi) if ("model" in factura) expect(factura.model).toBe(salvata.model);
    }
    const pica = rulari.filter(({ salvata }) => salvata.model === LITE_31);
    expect(pica.map(({ eval: { sumar } }) => [sumar.esuate, sumar.corecte])).toEqual([
      [3, 0],
      [3, 0],
    ]);
  });

  it("construieste toate modelele inainte de primul apel: o cheie lipsa opreste comparatia fara apeluri", async () => {
    const lite = modelCorect();
    const creeazaModel = (nume: string) => {
      if (nume === PREVIEW) throw new Error("GOOGLE_API_KEY lipsa");
      return lite;
    };

    await expect(ruleazaComparatia(optiuni({}, { creeazaModel }))).rejects.toThrow("GOOGLE_API_KEY");
    expect(lite.texte).toEqual([]);
  });

  it("asteapta pauzaMs intre facturi si intre rulari, nu si dupa ultima", async () => {
    const pauze: number[] = [];
    await ruleazaComparatia(
      optiuni(
        { [LITE]: modelCorect(), [LITE_31]: modelCorect(), [PREVIEW]: modelCorect() },
        { pauzaMs: 4500, asteapta: async (ms) => void pauze.push(ms) },
      ),
    );
    // 5 rulari x 2 pauze intre cele 3 facturi + 4 pauze intre rulari
    expect(pauze).toEqual(Array(14).fill(4500));
  });

  it("cu doar, face numai acea rulare si reface raportul din toate rularile salvate", async () => {
    await ruleazaComparatia(optiuni({ [LITE]: modelCorect(), [LITE_31]: modelCorect(), [PREVIEW]: modelCorect() }));
    const inainte = await citesteRulare(LITE, 1);
    const nou = new ModelDupaText({ "TEXT UNU": raspuns({ ...UNU, total: 1 }), "TEXT DOI": raspuns(DOI), "TEXT TREI": raspuns(TREI) });
    const nefolosit = modelCorect();

    const { raport } = await ruleazaComparatia(
      optiuni(
        { [LITE]: nefolosit, [LITE_31]: nou, [PREVIEW]: nefolosit },
        { doar: { model: LITE_31, rulare: 2 }, acum: () => new Date("2026-11-20T09:00:00.000Z") },
      ),
    );

    expect(nou.texte).toEqual(TEXTE);
    expect(nefolosit.texte).toEqual([]);
    expect(await citesteRulare(LITE, 1)).toEqual(inainte);
    expect((await citesteRulare(LITE_31, 2)).inceput).toBe("2026-11-20T09:00:00.000Z");
    expect(raport).toContain(`## ${LITE_31}\n`);
    expect(raport).toContain("| Inceput | 2026-11-19 15:40 UTC | 2026-11-20 09:00 UTC |\n");
    expect(raport).toContain("| Controale corecte, din toate | 27/27 | 26/27 |\n");
    expect(await readFile(fisierRaport, "utf8")).toBe(raport);
  });

  it("arunca la o rulare doar care nu e pe lista, fara apeluri", async () => {
    const lite = modelCorect();
    await expect(
      ruleazaComparatia(optiuni({ [LITE]: lite, [LITE_31]: lite, [PREVIEW]: lite }, { doar: { model: PREVIEW, rulare: 2 } })),
    ).rejects.toThrow(/gemini-3-flash-preview.*2/);
    expect(lite.texte).toEqual([]);
  });

  it("refacerea din rezultatele salvate da acelasi raport ca rularea, fara niciun apel la model", async () => {
    const modele = { [LITE]: modelCorect(), [LITE_31]: new ModelCarePica(new Error("503")), [PREVIEW]: modelCorect() };
    const live = await ruleazaComparatia(optiuni(modele));
    const scris = await readFile(fisierRaport, "utf8");
    await unlink(fisierRaport);

    const refacut = await refaRaportul(optiuniRaport());

    expect(scris).toBe(live.raport);
    expect(refacut.raport).toBe(live.raport);
    expect(await readFile(fisierRaport, "utf8")).toBe(scris);
    expect(refacut.rulari).toEqual(live.rulari);
    expect([modele[LITE].texte.length, modele[LITE_31].apeluri, modele[PREVIEW].texte.length]).toEqual([6, 6, 3]);
  });
});

describe("refaRaportul", () => {
  const extrasa = (fisier: string, factura: Factura, latentaMs: number, model: string) => ({
    fisier,
    factura,
    tokeni: { intrare: 1000, iesire: 200 },
    latentaMs,
    model,
    dinRezerva: false,
  });
  const salvata = (model: string, rulare: number, facturi: RulareSalvata["facturi"]): RulareSalvata => ({
    provider: "gemini",
    model,
    rulare,
    inceput: `2026-11-19T1${rulare}:00:00.000Z`,
    intrare: "set de test",
    dataReferinta,
    reincercari: 2,
    pauzaMs: 4500,
    facturi,
  });
  const lista = [
    { nume: LITE, rulari: 2 },
    { nume: "model-fals", rulari: 1 },
  ];
  const RULARI = [
    salvata(LITE, 1, [extrasa("01.txt", UNU, 1000, LITE), extrasa("02.txt", DOI, 2000, LITE), extrasa("03.txt", TREI, 9000, LITE)]),
    salvata(LITE, 2, [extrasa("01.txt", { ...UNU, total: 1 }, 1500, LITE), { fisier: "02.txt", eroare: "503" }, extrasa("03.txt", TREI, 2500, LITE)]),
    salvata("model-fals", 1, [extrasa("01.txt", UNU, 500, "model-fals"), extrasa("02.txt", DOI, 700, "model-fals"), extrasa("03.txt", TREI, 600, "model-fals")]),
  ];

  async function scrieRularile(rulari: RulareSalvata[] = RULARI) {
    await mkdir(dirRulari, { recursive: true });
    for (const r of rulari) await writeFile(fisierRulare(dirRulari, { model: r.model, rulare: r.rulare }), JSON.stringify(r));
  }

  it("scrie raportul notand rularile salvate fata de set, in ordinea listei, fara extractor", async () => {
    await scrieRularile([...RULARI].reverse());

    const { raport, rulari } = await refaRaportul({ ...optiuniRaport(), lista });

    const set = await citesteSetul({ dirFacturi, dirAsteptat, fisierCoduriAsteptate, dataReferinta });
    const notate = RULARI.map((r) => ({ salvata: r, eval: noteazaSetul(set, r.facturi, dataReferinta) }));
    expect(rulari).toEqual(notate);
    expect(raport).toBe(raportComparatie(notate, { rezultateBrute: "comparatie/<model>-<n>.json" }));
    expect(await readFile(fisierRaport, "utf8")).toBe(raport);
    expect(raport).toContain("| Inceput | 2026-11-19 11:00 UTC | 2026-11-19 12:00 UTC | 2026-11-19 11:00 UTC |\n");
    expect(raport).toContain("| Controale corecte, din toate | 27/27 | 18/27 | 27/27 |\n");
    expect(raport).toContain("| Cost total | $0.002400 | $0.001600 | pret necunoscut |\n");
  });

  it("arunca o eroare care numeste fisierul cand lipseste o rulare de pe lista", async () => {
    await scrieRularile(RULARI.slice(0, 2));
    await expect(refaRaportul({ ...optiuniRaport(), lista })).rejects.toThrow(/model-fals-1\.json/);
  });

  it("arunca cand o rulare salvata nu are facturile setului", async () => {
    await scrieRularile([RULARI[0], { ...RULARI[1], facturi: RULARI[1].facturi.slice(0, 2) }, RULARI[2]]);
    await expect(refaRaportul({ ...optiuniRaport(), lista })).rejects.toThrow(/gemini-3\.5-flash-lite-2\.json.*01\.txt, 02\.txt/);
  });

  it("arunca cand rularea a fost notata fata de alta zi de referinta decat setul", async () => {
    await scrieRularile([RULARI[0], { ...RULARI[1], dataReferinta: "2026-11-20" }, RULARI[2]]);
    await expect(refaRaportul({ ...optiuniRaport(), lista })).rejects.toThrow(/gemini-3\.5-flash-lite-2\.json.*2026-11-20.*2026-11-12/);
  });

  it("arunca cand fisierul are alt model sau alta rulare decat numele lui", async () => {
    await scrieRularile();
    const fisier = fisierRulare(dirRulari, { model: LITE, rulare: 2 });
    await writeFile(fisier, JSON.stringify({ ...RULARI[1], rulare: 1 }));
    await expect(refaRaportul({ ...optiuniRaport(), lista })).rejects.toThrow(/gemini-3\.5-flash-lite-2\.json.*gemini-3\.5-flash-lite #1/);
    await writeFile(fisier, JSON.stringify({ ...RULARI[1], model: "model-fals" }));
    await expect(refaRaportul({ ...optiuniRaport(), lista })).rejects.toThrow(/gemini-3\.5-flash-lite-2\.json.*model-fals #2/);
  });

  it("arunca cand o factura are raspunsul altui model sau al unei rezerve, ca pretul sa nu se schimbe in tacere", async () => {
    await scrieRularile();
    const fisier = fisierRulare(dirRulari, { model: LITE, rulare: 2 });
    const [prima, ...rest] = RULARI[1].facturi;
    await writeFile(fisier, JSON.stringify({ ...RULARI[1], facturi: [{ ...prima, model: LITE_31, dinRezerva: true }, ...rest] }));
    await expect(refaRaportul({ ...optiuniRaport(), lista })).rejects.toThrow(
      /gemini-3\.5-flash-lite-2\.json: 01\.txt.*gemini-3\.1-flash-lite.*gemini-3\.5-flash-lite/,
    );
    await writeFile(fisier, JSON.stringify({ ...RULARI[1], facturi: [{ ...prima, dinRezerva: true }, ...rest] }));
    await expect(refaRaportul({ ...optiuniRaport(), lista })).rejects.toThrow(/gemini-3\.5-flash-lite-2\.json: 01\.txt.*rezerva/);
    await writeFile(fisier, JSON.stringify(RULARI[1]));
    await expect(refaRaportul({ ...optiuniRaport(), lista })).resolves.toBeDefined();
  });

  it("arunca o eroare care numeste fisierul cand rularea salvata nu e JSON sau nu respecta schema", async () => {
    await scrieRularile();
    const fisier = fisierRulare(dirRulari, { model: "model-fals", rulare: 1 });
    await writeFile(fisier, "{ nu e json");
    await expect(refaRaportul({ ...optiuniRaport(), lista })).rejects.toThrow(/model-fals-1\.json/);
    await writeFile(fisier, JSON.stringify({ ...RULARI[2], facturi: [{ fisier: "01.txt" }] }));
    await expect(refaRaportul({ ...optiuniRaport(), lista })).rejects.toThrow(/model-fals-1\.json/);
  });
});

describe("ruleaza", () => {
  const optiuniRulare = (alte: Partial<OptiuniRulare> & Pick<OptiuniRulare, "comanda" | "modele">): OptiuniRulare => ({
    ...optiuniRaport(),
    intrare: "set de test",
    pauzaMs: 0,
    log: vi.fn(),
    asteapta: async () => {},
    acum: () => new Date("2026-11-19T15:40:00.000Z"),
    ...alte,
  });
  const toate = (): Record<string, ModelDupaText> => ({ [LITE]: modelCorect(), [LITE_31]: modelCorect(), [PREVIEW]: modelCorect() });

  it("cu toate, cere modelele o data, face toate rularile si scrie in log rezumatul fiecarei rulari si raportul", async () => {
    const modele = toate();
    const cereri = vi.fn(() => ({ provider: "gemini", creeazaModel: (nume: string) => modele[nume] }));
    const log = vi.fn();

    const { rulari } = await ruleaza(optiuniRulare({ comanda: { tip: "toate" }, modele: cereri, log }));

    expect(cereri).toHaveBeenCalledTimes(1);
    expect(rulari).toHaveLength(5);
    expect(modele[LITE].texte).toHaveLength(6);
    const linii = log.mock.calls.map(([linie]) => String(linie));
    expect(linii).toContain(`Provider gemini, fara rezerva, maxRetries ${REINCERCARI_COMPARATIE}; modele: ${LITE} x2, ${LITE_31} x2, ${PREVIEW} x1`);
    expect(linii.slice(-6)).toEqual([...rulari.map((r) => rezumatRulare(r)), `Scris: ${fisierRaport}`]);
  });

  it("cu raport, reface raportul din rularile salvate fara sa ceara modelele", async () => {
    await ruleaza(optiuniRulare({ comanda: { tip: "toate" }, modele: () => ({ provider: "gemini", creeazaModel: () => modelCorect() }) }));
    const scris = await readFile(fisierRaport, "utf8");
    await unlink(fisierRaport);
    const cereri = vi.fn(() => {
      throw new Error("raportul nu cere modele");
    });

    const { raport } = await ruleaza(optiuniRulare({ comanda: { tip: "raport" }, modele: cereri }));

    expect(cereri).not.toHaveBeenCalled();
    expect(raport).toBe(scris);
    expect(await readFile(fisierRaport, "utf8")).toBe(scris);
  });

  it("cu una, face doar acea rulare", async () => {
    await ruleaza(optiuniRulare({ comanda: { tip: "toate" }, modele: () => ({ provider: "gemini", creeazaModel: () => modelCorect() }) }));
    const modele = toate();

    await ruleaza(
      optiuniRulare({ comanda: { tip: "una", rulare: { model: PREVIEW, rulare: 1 } }, modele: () => ({ provider: "gemini", creeazaModel: (nume) => modele[nume] }) }),
    );

    expect([modele[LITE].texte, modele[LITE_31].texte, modele[PREVIEW].texte]).toEqual([[], [], TEXTE]);
  });
});

it("nu incarca dotenv/config la import", () => {
  expect(dotenv.incarcat).toBe(false);
});
