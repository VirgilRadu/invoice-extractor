import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Extractor, RezultatExtragere } from "../../src/extractor.js";
import type { Factura } from "../../src/schema.js";
import { raportEval } from "../../src/eval/raport.js";
import { ruleaza, ruleazaEval } from "../../src/eval/ruleaza.js";

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

    const { sumar } = await ruleazaEval({ extrage, dirFacturi, dirAsteptat, pauzaMs: 0, log: vi.fn() });

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

    const { sumar } = await ruleazaEval({ extrage, dirFacturi, dirAsteptat, pauzaMs: 0, log });

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

  it("arata in log N/M controale corecte pentru o factura partial gresita", async () => {
    await scrie("01", "TEXT UNU", UNU);
    await scrie("02", "TEXT DOI", DOI);
    const gresit = structuredClone(UNU);
    gresit.linii[1].pret = 1;
    const log = vi.fn();

    await ruleazaEval({
      extrage: extractorDupaText({ "TEXT UNU": gresit, "TEXT DOI": { ...DOI, total: 30 } }),
      dirFacturi,
      dirAsteptat,
      pauzaMs: 0,
      log,
    });

    // UNU: 5 + 2 x 3 = 11 controale, un pret gresit; DOI: 5 + 3 = 8, totalul gresit.
    expect(log.mock.calls.map(([linie]) => linie)).toEqual([
      expect.stringMatching(/^01\.txt: 10\/11 controale corecte/),
      expect.stringMatching(/^02\.txt: 7\/8 controale corecte/),
    ]);
  });

  it("extrage strict pe rand: a doua extragere incepe dupa ce prima s-a terminat si pauza s-a scurs", async () => {
    await scrie("01", "TEXT UNU", UNU);
    await scrie("02", "TEXT DOI", DOI);
    const facturi: Record<string, Factura> = { "TEXT UNU": UNU, "TEXT DOI": DOI };
    const evenimente: string[] = [];
    const extrage: Extractor = async (text) => {
      evenimente.push(`start ${text}`);
      await new Promise((rezolva) => setTimeout(rezolva, 20));
      evenimente.push(`gata ${text}`);
      return { factura: structuredClone(facturi[text]), tokeni: { intrare: 1, iesire: 1 }, latentaMs: 1, model: "m" };
    };

    await ruleazaEval({
      extrage,
      dirFacturi,
      dirAsteptat,
      pauzaMs: 10,
      log: vi.fn(),
      asteapta: async (ms) => {
        evenimente.push(`pauza ${ms}`);
        await new Promise((rezolva) => setTimeout(rezolva, ms));
        evenimente.push("pauza gata");
      },
    });

    expect(evenimente).toEqual([
      "start TEXT UNU",
      "gata TEXT UNU",
      "pauza 10",
      "pauza gata",
      "start TEXT DOI",
      "gata TEXT DOI",
    ]);
  });

  describe("tokeni, latenta si cost", () => {
    const RASPUNSURI: Record<string, Omit<RezultatExtragere, "factura">> = {
      "TEXT UNU": { tokeni: { intrare: 1000, iesire: 200 }, latentaMs: 1500, model: "gemini-3.5-flash-lite" },
      "TEXT DOI": { tokeni: { intrare: 2000, iesire: 400 }, latentaMs: 2500, model: "gemini-3.5-flash-lite" },
    };
    const extrage: Extractor = async (text) => {
      const factura = { "TEXT UNU": UNU, "TEXT DOI": DOI }[text];
      if (!factura) throw new Error("503 Service Unavailable");
      return { factura: structuredClone(factura), ...RASPUNSURI[text] };
    };

    it("pastreaza pe fiecare factura tokenii, latenta si modelul; extragerea esuata are 0 tokeni si nicio latenta", async () => {
      await scrie("01", "TEXT UNU", UNU);
      await scrie("02", "TEXT STRICAT", DOI);
      await scrie("03", "TEXT DOI", DOI);

      const { consum } = await ruleazaEval({ extrage, dirFacturi, dirAsteptat, pauzaMs: 0, log: vi.fn() });

      expect(consum.facturi).toEqual([
        {
          fisier: "01.txt",
          corecte: 11,
          controale: 11,
          tokeni: { intrare: 1000, iesire: 200 },
          latentaMs: 1500,
          model: "gemini-3.5-flash-lite",
          cost: expect.closeTo((1000 * 0.3 + 200 * 2.5) / 1_000_000, 15),
        },
        {
          fisier: "02.txt",
          corecte: 0,
          controale: 8,
          tokeni: { intrare: 0, iesire: 0 },
          latentaMs: null,
          model: null,
          cost: 0,
        },
        {
          fisier: "03.txt",
          corecte: 8,
          controale: 8,
          tokeni: { intrare: 2000, iesire: 400 },
          latentaMs: 2500,
          model: "gemini-3.5-flash-lite",
          cost: expect.closeTo((2000 * 0.3 + 400 * 2.5) / 1_000_000, 15),
        },
      ]);
      expect(consum).toMatchObject({ intrare: 3000, iesire: 600, extrase: 2, latentaMedieMs: 2000, latentaMaxMs: 2500 });
      expect(consum.cost).toBeCloseTo((3000 * 0.3 + 600 * 2.5) / 1_000_000, 15);
    });

    it("nu imparte la zero cand toate extragerile esueaza", async () => {
      await scrie("01", "TEXT STRICAT", UNU);

      const { consum } = await ruleazaEval({ extrage, dirFacturi, dirAsteptat, pauzaMs: 0, log: vi.fn() });

      expect(consum).toMatchObject({ intrare: 0, iesire: 0, cost: 0, costMediu: null, latentaMedieMs: null });
    });

    it("ruleaza scrie in fisierul primit exact raportul cu acuratetea si costul", async () => {
      await scrie("01", "TEXT UNU", UNU);
      await scrie("02", "TEXT DOI", DOI);
      const fisierIesire = join(dir, "rezultate", "eval.md");
      const meta = { model: "gemini-3.5-flash-lite", dataRulare: "2026-11-12" };

      const { sumar, consum } = await ruleaza({
        extrage,
        dirFacturi,
        dirAsteptat,
        pauzaMs: 0,
        log: vi.fn(),
        fisierIesire,
        ...meta,
      });

      const scris = await readFile(fisierIesire, "utf8");
      expect(scris).toBe(raportEval(sumar, consum, meta));
      expect(scris).toContain("## Tokeni, cost si latenta");
      expect(scris).toContain("- Tokeni intrare: 3000");
    });
  });

  it("nu incarca dotenv/config la import", () => {
    expect(dotenv.incarcat).toBe(false);
  });
});
