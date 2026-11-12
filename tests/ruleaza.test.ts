import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { FakeToolCallingModel } from "langchain";
import { creeazaExtractor, type Extractor } from "../src/extractor.js";
import type { Factura } from "../src/schema.js";
import { ruleaza } from "../src/ruleaza.js";

// dotenv/config inlocuit: factory-ul ruleaza doar daca modulul e importat.
const dotenv = vi.hoisted(() => ({ incarcat: false }));
vi.mock("dotenv/config", () => {
  dotenv.incarcat = true;
  return {};
});

const ANTET = "fisier,furnizor,cui,data,produs,cantitate,pret,total,status,probleme\n";
const AZI = "2026-11-12";
let dir: string;
let intrare: string;
let iesire: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ruleaza-"));
  intrare = join(dir, "facturi");
  iesire = join(dir, "rezultate", "facturi.csv");
  await mkdir(intrare);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

// Extractor fals al carui rezultat depinde de textul primit; textul necunoscut arunca.
function extractorDupaText(facturi: Record<string, Factura>): Extractor {
  return async (text) => {
    const factura = facturi[text];
    if (!factura) throw new Error(`text necunoscut: ${text}`);
    return { factura: structuredClone(factura), tokeni: { intrare: 10, iesire: 5 }, latentaMs: 1, model: "model-fals" };
  };
}

async function scrieFacturi(texte: Record<string, string>) {
  for (const [nume, text] of Object.entries(texte)) await writeFile(join(intrare, nume), text);
}

const FACTURA_UNU: Factura = {
  furnizor: "Flori Unu SRL",
  cui: "RO45187325",
  data: "2026-10-14",
  linii: [
    { produs: "Ghiveci", cantitate: 2, pret: 45.5 },
    { produs: "Pamant", cantitate: 3, pret: 18.9 },
  ],
  total: 147.7,
};

const FACTURA_DOI: Factura = {
  furnizor: "Papetaria Doi SRL",
  cui: "RO21945678",
  data: "2026-09-01",
  linii: [{ produs: "Caiet", cantitate: 4, pret: 7.25 }],
  total: 29,
};

// Suma gresita (totalul citit gresit), data imposibila si CUI cu litera: toate trei raman cum au fost extrase.
const FACTURA_GRESITA: Factura = {
  furnizor: "Service Trei SRL",
  cui: "RO4293386O",
  data: "2026-02-31",
  linii: [{ produs: "Ulei motor", cantitate: 1, pret: 1089.05 }],
  total: 1.08905,
};

describe("ruleaza", () => {
  it("citeste, extrage cu modelul fals, valideaza si scrie CSV-ul cap la cap", async () => {
    await scrieFacturi({ "01.txt": "FACTURA 01" });
    const model = new FakeToolCallingModel({
      structuredResponse: {
        raw: new AIMessage({
          content: "",
          usage_metadata: { input_tokens: 300, output_tokens: 80, total_tokens: 380 },
        }),
        parsed: { ...FACTURA_UNU, furnizor: "Flori, Ghivece SRL" },
      },
    });
    const log = vi.fn();

    await ruleaza({
      extrage: creeazaExtractor(model, "model-fals"),
      dirIntrare: intrare,
      fisierIesire: iesire,
      log,
      azi: AZI,
    });

    expect(await readFile(iesire, "utf8")).toBe(
      ANTET +
        '01.txt,"Flori, Ghivece SRL",RO45187325,2026-10-14,Ghiveci,2,45.5,147.7,ok,\n' +
        '01.txt,"Flori, Ghivece SRL",RO45187325,2026-10-14,Pamant,3,18.9,147.7,ok,\n',
    );
    expect(log.mock.calls.map(([linie]) => linie)).toEqual([
      expect.stringMatching(/^01\.txt: 2 linii.*300.*80.* -> ok$/),
      "Facturi: 1, ok: 1, de_verificat: 0",
    ]);
  });

  it("trimite textul fiecarui fisier la extractor si pune factura pe randul fisierului ei", async () => {
    await scrieFacturi({ "01.txt": "TEXT FACTURA UNU", "02.txt": "TEXT FACTURA DOI" });
    const log = vi.fn();

    await ruleaza({
      extrage: extractorDupaText({ "TEXT FACTURA UNU": FACTURA_UNU, "TEXT FACTURA DOI": FACTURA_DOI }),
      dirIntrare: intrare,
      fisierIesire: iesire,
      log,
      azi: AZI,
    });

    expect(await readFile(iesire, "utf8")).toBe(
      ANTET +
        "01.txt,Flori Unu SRL,RO45187325,2026-10-14,Ghiveci,2,45.5,147.7,ok,\n" +
        "01.txt,Flori Unu SRL,RO45187325,2026-10-14,Pamant,3,18.9,147.7,ok,\n" +
        "02.txt,Papetaria Doi SRL,RO21945678,2026-09-01,Caiet,4,7.25,29,ok,\n",
    );
    expect(log.mock.calls.slice(0, 2).map(([linie]) => linie.split(":")[0])).toEqual(["01.txt", "02.txt"]);
  });

  // Inlocuieste "opreste rularea la prima extragere esuata": acum factura esuata are randul ei si rularea continua.
  it("continua dupa o extragere esuata: ok, semnalata si esuata apar toate in CSV, in ordinea fisierelor", async () => {
    await scrieFacturi({ "01.txt": "TEXT FACTURA UNU", "02.txt": "TEXT STRICAT", "03.txt": "TEXT GRESIT" });
    const log = vi.fn();
    const texte: string[] = [];
    const extrage = extractorDupaText({ "TEXT FACTURA UNU": FACTURA_UNU, "TEXT GRESIT": FACTURA_GRESITA });

    await ruleaza({
      extrage: async (text) => {
        texte.push(text);
        return extrage(text);
      },
      dirIntrare: intrare,
      fisierIesire: iesire,
      log,
      azi: AZI,
    });

    expect(texte).toEqual(["TEXT FACTURA UNU", "TEXT STRICAT", "TEXT GRESIT"]);
    expect(await readFile(iesire, "utf8")).toBe(
      ANTET +
        "01.txt,Flori Unu SRL,RO45187325,2026-10-14,Ghiveci,2,45.5,147.7,ok,\n" +
        "01.txt,Flori Unu SRL,RO45187325,2026-10-14,Pamant,3,18.9,147.7,ok,\n" +
        "02.txt,,,,,,,,de_verificat,extragere esuata: text necunoscut: TEXT STRICAT\n" +
        "03.txt,Service Trei SRL,RO4293386O,2026-02-31,Ulei motor,1,1089.05,1.08905,de_verificat," +
        '"suma liniilor 1089.05 difera de total 1.08905; ' +
        'data ""2026-02-31"" nu este o data reala in formatul YYYY-MM-DD; ' +
        'CUI ""RO4293386O"" nu are formatul RO optional + 2-10 cifre"\n',
    );
    expect(log.mock.calls.map(([linie]) => linie)).toEqual([
      expect.stringMatching(/^01\.txt: 2 linii, .* -> ok$/),
      "02.txt: extragere esuata -> de_verificat: text necunoscut: TEXT STRICAT",
      expect.stringMatching(/^03\.txt: 1 linii, .* -> de_verificat: suma liniilor 1089\.05 .*; data .*; CUI .*$/),
      "Facturi: 3, ok: 1, de_verificat: 2",
    ]);
  });

  it("pune in CSV doar primul rand al erorii, iar in log eroarea intreaga pe un rand", async () => {
    await scrieFacturi({ "01.txt": "TEXT" });
    const log = vi.fn();

    await ruleaza({
      extrage: async () => {
        throw new Error("Raspunsul modelului nu respecta schema:\n  total: lipseste\n  cui: lipseste");
      },
      dirIntrare: intrare,
      fisierIesire: iesire,
      log,
      azi: AZI,
    });

    expect(await readFile(iesire, "utf8")).toBe(
      ANTET + "01.txt,,,,,,,,de_verificat,extragere esuata: Raspunsul modelului nu respecta schema:\n",
    );
    expect(log.mock.calls[0][0]).toBe(
      "01.txt: extragere esuata -> de_verificat: Raspunsul modelului nu respecta schema: total: lipseste cui: lipseste",
    );
  });

  it("nu corecteaza o factura semnalata: suma, data si CUI ajung in CSV exact cum au fost extrase", async () => {
    const sumaGresita: Factura = { ...FACTURA_UNU, total: 150.7 };
    const dataGresita: Factura = { ...FACTURA_DOI, data: "2026-13-01" };
    const cuiGresit: Factura = { ...FACTURA_DOI, cui: "RO 2194 5679" };
    await scrieFacturi({ "01.txt": "SUMA", "02.txt": "DATA", "03.txt": "CUI" });

    await ruleaza({
      extrage: extractorDupaText({ SUMA: sumaGresita, DATA: dataGresita, CUI: cuiGresit }),
      dirIntrare: intrare,
      fisierIesire: iesire,
      log: vi.fn(),
      azi: AZI,
    });

    const randuri = (await readFile(iesire, "utf8")).trimEnd().split("\n").slice(1).map((rand) => rand.split(","));
    const valori = (r: string[]) => r.slice(1, 8);
    expect(valori(randuri[0])).toEqual(["Flori Unu SRL", "RO45187325", "2026-10-14", "Ghiveci", "2", "45.5", "150.7"]);
    expect(valori(randuri[2])).toEqual(["Papetaria Doi SRL", "RO21945678", "2026-13-01", "Caiet", "4", "7.25", "29"]);
    expect(valori(randuri[3])).toEqual(["Papetaria Doi SRL", "RO 2194 5679", "2026-09-01", "Caiet", "4", "7.25", "29"]);
    expect(randuri.map((r) => r[8])).toEqual(["de_verificat", "de_verificat", "de_verificat", "de_verificat"]);
  });

  it("valideaza data fata de ziua primita, nu fata de ceasul masinii", async () => {
    await scrieFacturi({ "01.txt": "TEXT" });
    const extrage = extractorDupaText({ TEXT: { ...FACTURA_DOI, data: "2030-01-15" } });

    await ruleaza({ extrage, dirIntrare: intrare, fisierIesire: iesire, log: vi.fn(), azi: "2030-01-14" });
    expect(await readFile(iesire, "utf8")).toContain(",de_verificat,data 2030-01-15 este dupa 2030-01-14\n");

    await ruleaza({ extrage, dirIntrare: intrare, fisierIesire: iesire, log: vi.fn(), azi: "2030-01-15" });
    expect(await readFile(iesire, "utf8")).toContain(",29,ok,\n");
  });

  it("asteapta pauzaMs intre facturi, pana la capat inainte de urmatoarea extragere, nu si dupa ultima", async () => {
    await scrieFacturi({ "01.txt": "TEXT FACTURA UNU", "02.txt": "TEXT STRICAT", "03.txt": "TEXT FACTURA DOI" });
    const evenimente: string[] = [];
    const extrage = extractorDupaText({ "TEXT FACTURA UNU": FACTURA_UNU, "TEXT FACTURA DOI": FACTURA_DOI });

    await ruleaza({
      extrage: async (text) => {
        evenimente.push(`start ${text}`);
        await new Promise((rezolva) => setTimeout(rezolva, 20));
        evenimente.push(`gata ${text}`);
        return extrage(text);
      },
      dirIntrare: intrare,
      fisierIesire: iesire,
      log: vi.fn(),
      azi: AZI,
      pauzaMs: 10,
      asteapta: async (ms) => {
        evenimente.push(`pauza ${ms}`);
        await new Promise((rezolva) => setTimeout(rezolva, ms));
        evenimente.push("pauza gata");
      },
    });

    // Cu o pauza neasteptata (void asteapta(...)), "start" ar aparea inaintea lui "pauza gata".
    expect(evenimente).toEqual([
      "start TEXT FACTURA UNU",
      "gata TEXT FACTURA UNU",
      "pauza 10",
      "pauza gata",
      "start TEXT STRICAT",
      "gata TEXT STRICAT",
      "pauza 10",
      "pauza gata",
      "start TEXT FACTURA DOI",
      "gata TEXT FACTURA DOI",
    ]);
  });

  it("nu asteapta deloc fara pauzaMs", async () => {
    await scrieFacturi({ "01.txt": "TEXT FACTURA UNU", "02.txt": "TEXT FACTURA DOI" });
    const asteapta = vi.fn(async () => {});

    await ruleaza({
      extrage: extractorDupaText({ "TEXT FACTURA UNU": FACTURA_UNU, "TEXT FACTURA DOI": FACTURA_DOI }),
      dirIntrare: intrare,
      fisierIesire: iesire,
      log: vi.fn(),
      azi: AZI,
      asteapta,
    });

    expect(asteapta).not.toHaveBeenCalled();
  });

  it("nu incarca dotenv/config la import", () => {
    expect(dotenv.incarcat).toBe(false);
  });
});
