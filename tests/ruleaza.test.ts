import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

const ANTET = "fisier,furnizor,cui,data,produs,cantitate,pret,total\n";
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

// Extractor fals al carui rezultat depinde de textul primit.
function extractorDupaText(facturi: Record<string, Factura>): Extractor {
  return async (text) => {
    const factura = facturi[text];
    if (!factura) throw new Error(`text necunoscut: ${text}`);
    return { factura, tokeni: { intrare: 10, iesire: 5 }, latentaMs: 1, model: "model-fals" };
  };
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
  cui: "RO123",
  data: "2026-09-01",
  linii: [{ produs: "Caiet", cantitate: 4, pret: 7.25 }],
  total: 29,
};

describe("ruleaza", () => {
  it("citeste, extrage cu modelul fals si scrie CSV-ul cap la cap", async () => {
    await writeFile(join(intrare, "01.txt"), "FACTURA 01");
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

    await ruleaza({ extrage: creeazaExtractor(model, "model-fals"), dirIntrare: intrare, fisierIesire: iesire, log });

    expect(await readFile(iesire, "utf8")).toBe(
      ANTET +
        '01.txt,"Flori, Ghivece SRL",RO45187325,2026-10-14,Ghiveci,2,45.5,147.7\n' +
        '01.txt,"Flori, Ghivece SRL",RO45187325,2026-10-14,Pamant,3,18.9,147.7\n',
    );
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatch(/01\.txt.*2 linii.*300.*80/);
  });

  it("trimite textul fiecarui fisier la extractor si pune factura pe randul fisierului ei", async () => {
    await writeFile(join(intrare, "01.txt"), "TEXT FACTURA UNU");
    await writeFile(join(intrare, "02.txt"), "TEXT FACTURA DOI");
    const log = vi.fn();

    await ruleaza({
      extrage: extractorDupaText({ "TEXT FACTURA UNU": FACTURA_UNU, "TEXT FACTURA DOI": FACTURA_DOI }),
      dirIntrare: intrare,
      fisierIesire: iesire,
      log,
    });

    expect(await readFile(iesire, "utf8")).toBe(
      ANTET +
        "01.txt,Flori Unu SRL,RO45187325,2026-10-14,Ghiveci,2,45.5,147.7\n" +
        "01.txt,Flori Unu SRL,RO45187325,2026-10-14,Pamant,3,18.9,147.7\n" +
        "02.txt,Papetaria Doi SRL,RO123,2026-09-01,Caiet,4,7.25,29\n",
    );
    expect(log.mock.calls.map(([linie]) => linie.split(":")[0])).toEqual(["01.txt", "02.txt"]);
  });

  it("opreste rularea cu o eroare care numeste fisierul cand extragerea pica", async () => {
    await writeFile(join(intrare, "01.txt"), "TEXT FACTURA UNU");
    await writeFile(join(intrare, "02.txt"), "TEXT STRICAT");

    await expect(
      ruleaza({
        extrage: extractorDupaText({ "TEXT FACTURA UNU": FACTURA_UNU }),
        dirIntrare: intrare,
        fisierIesire: iesire,
        log: vi.fn(),
      }),
    ).rejects.toThrow(/02\.txt.*text necunoscut: TEXT STRICAT/);
    await expect(access(iesire)).rejects.toThrow();
  });

  it("nu incarca dotenv/config la import", () => {
    expect(dotenv.incarcat).toBe(false);
  });
});
