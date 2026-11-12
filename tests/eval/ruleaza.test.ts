import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Extractor } from "../../src/extractor.js";
import type { Factura } from "../../src/schema.js";
import { ruleazaEval } from "../../src/eval/ruleaza.js";

// dotenv/config inlocuit: factory-ul ruleaza doar daca modulul e importat.
const dotenv = vi.hoisted(() => ({ incarcat: false }));
vi.mock("dotenv/config", () => {
  dotenv.incarcat = true;
  return {};
});

let dir: string;
let dirFacturi: string;
let dirAsteptat: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "eval-"));
  dirFacturi = join(dir, "facturi");
  dirAsteptat = join(dir, "asteptat");
  await mkdir(dirFacturi);
  await mkdir(dirAsteptat);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

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

// Extractor fals al carui rezultat depinde de textul primit; textul necunoscut arunca.
function extractorDupaText(facturi: Record<string, Factura>): Extractor & { texte: string[] } {
  const texte: string[] = [];
  const extrage = async (text: string) => {
    texte.push(text);
    const factura = facturi[text];
    if (!factura) throw new Error(`text necunoscut: ${text}`);
    return { factura: structuredClone(factura), tokeni: { intrare: 10, iesire: 5 }, latentaMs: 1, model: "model-fals" };
  };
  return Object.assign(extrage, { texte });
}

async function scrie(nume: string, text: string, asteptat: Factura | string) {
  await writeFile(join(dirFacturi, `${nume}.txt`), text);
  await writeFile(join(dirAsteptat, `${nume}.json`), typeof asteptat === "string" ? asteptat : JSON.stringify(asteptat));
}

describe("ruleazaEval", () => {
  it("compara fiecare factura cu fisierul ei asteptat", async () => {
    await scrie("01", "TEXT UNU", UNU);
    await scrie("02", "TEXT DOI", DOI);
    const extrage = extractorDupaText({ "TEXT UNU": UNU, "TEXT DOI": { ...DOI, total: 30 } });

    const sumar = await ruleazaEval({ extrage, dirFacturi, dirAsteptat, pauzaMs: 0, log: vi.fn() });

    expect(extrage.texte).toEqual(["TEXT UNU", "TEXT DOI"]);
    expect(sumar.facturi).toBe(2);
    expect(sumar.facturiComplete).toBe(1);
    expect(sumar.controale.total).toEqual({ corecte: 1, total: 2, acuratete: 0.5 });
    expect(sumar.controale.produs).toEqual({ corecte: 3, total: 3, acuratete: 1 });
    expect(sumar.detalii).toEqual([
      { fisier: "01.txt", esecuri: [] },
      { fisier: "02.txt", esecuri: [{ control: "total", asteptat: 29, obtinut: 30 }] },
    ]);
  });

  it("continua dupa o extragere care arunca si o numara ca gresita", async () => {
    await scrie("01", "TEXT STRICAT", UNU);
    await scrie("02", "TEXT DOI", DOI);
    const extrage = extractorDupaText({ "TEXT DOI": DOI });
    const log = vi.fn();

    const sumar = await ruleazaEval({ extrage, dirFacturi, dirAsteptat, pauzaMs: 0, log });

    expect(extrage.texte).toEqual(["TEXT STRICAT", "TEXT DOI"]);
    expect(sumar.detalii[0]).toEqual({ fisier: "01.txt", eroare: "text necunoscut: TEXT STRICAT", esecuri: [] });
    expect(sumar.controale.furnizor).toEqual({ corecte: 1, total: 2, acuratete: 0.5 });
    expect(sumar.facturiComplete).toBe(1);
    expect(log.mock.calls.map(([linie]) => linie)).toEqual([
      expect.stringMatching(/^01\.txt: extragere esuata: text necunoscut/),
      expect.stringMatching(/^02\.txt: 8\/8 controale corecte/),
    ]);
  });

  it("arunca o eroare care numeste fisierul cand lipseste valoarea asteptata, inainte de orice extragere", async () => {
    await scrie("01", "TEXT UNU", UNU);
    await writeFile(join(dirFacturi, "02.txt"), "TEXT DOI");
    const extrage = extractorDupaText({ "TEXT UNU": UNU, "TEXT DOI": DOI });

    await expect(ruleazaEval({ extrage, dirFacturi, dirAsteptat, pauzaMs: 0, log: vi.fn() })).rejects.toThrow(
      /02\.json/,
    );
    expect(extrage.texte).toEqual([]);
  });

  it("arunca o eroare care numeste fisierul cand valoarea asteptata nu e JSON", async () => {
    await scrie("01", "TEXT UNU", "{ nu e json");
    await expect(
      ruleazaEval({ extrage: extractorDupaText({}), dirFacturi, dirAsteptat, pauzaMs: 0, log: vi.fn() }),
    ).rejects.toThrow(/01\.json/);
  });

  it("arunca o eroare care numeste fisierul si campul cand valoarea asteptata nu respecta schema", async () => {
    const { total: _total, ...faraTotal } = UNU;
    await scrie("01", "TEXT UNU", JSON.stringify(faraTotal));
    await expect(
      ruleazaEval({ extrage: extractorDupaText({}), dirFacturi, dirAsteptat, pauzaMs: 0, log: vi.fn() }),
    ).rejects.toThrow(/01\.json[\s\S]*total/);
  });

  it("asteapta pauzaMs intre extrageri, nu si dupa ultima", async () => {
    await scrie("01", "TEXT UNU", UNU);
    await scrie("02", "TEXT DOI", DOI);
    const pauze: number[] = [];

    await ruleazaEval({
      extrage: extractorDupaText({ "TEXT UNU": UNU, "TEXT DOI": DOI }),
      dirFacturi,
      dirAsteptat,
      pauzaMs: 4500,
      log: vi.fn(),
      asteapta: async (ms) => {
        pauze.push(ms);
      },
    });

    expect(pauze).toEqual([4500]);
  });

  it("nu incarca dotenv/config la import", () => {
    expect(dotenv.incarcat).toBe(false);
  });
});
