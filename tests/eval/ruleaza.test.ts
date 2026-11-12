import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { creeazaExtractor, type Extractor, type RezultatExtragere } from "../../src/extractor.js";
import type { Factura } from "../../src/schema.js";
import type { CodValidare } from "../../src/validare.js";
import { raportEval } from "../../src/eval/raport.js";
import { DATA_REFERINTA_SET, ruleaza, ruleazaEval, type OptiuniEval } from "../../src/eval/ruleaza.js";
import { ModelCarePica, ModelCareRaspunde } from "../modele-false.js";

// dotenv/config inlocuit: factory-ul ruleaza doar daca modulul e importat.
const dotenv = vi.hoisted(() => ({ incarcat: false }));
vi.mock("dotenv/config", () => {
  dotenv.incarcat = true;
  return {};
});

let dir: string;
let dirFacturi: string;
let dirAsteptat: string;
let fisierCoduriAsteptate: string;
let coduri: Record<string, CodValidare[]>;
const dataReferinta = "2026-11-12";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "eval-"));
  dirFacturi = join(dir, "facturi");
  dirAsteptat = join(dir, "asteptat");
  fisierCoduriAsteptate = join(dir, "asteptat-validare.json");
  coduri = {};
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
    return { factura: structuredClone(factura), tokeni: { intrare: 10, iesire: 5 }, latentaMs: 1, model: "model-fals", dinRezerva: false };
  };
  return Object.assign(extrage, { texte });
}

// Optiunile comune ale eval-ului; testul da extractorul si ce schimba fata de ele.
function optiuni(extrage: Extractor, alte: Partial<OptiuniEval> = {}): OptiuniEval {
  return { extrage, dirFacturi, dirAsteptat, fisierCoduriAsteptate, dataReferinta, pauzaMs: 0, log: vi.fn(), ...alte };
}

// Scrie factura, valoarea asteptata si codurile de validare asteptate pentru ea.
async function scrie(nume: string, text: string, asteptat: Factura | string, asteptateLaValidare: CodValidare[] = []) {
  await writeFile(join(dirFacturi, `${nume}.txt`), text);
  await writeFile(join(dirAsteptat, `${nume}.json`), typeof asteptat === "string" ? asteptat : JSON.stringify(asteptat));
  coduri[nume] = asteptateLaValidare;
  await writeFile(fisierCoduriAsteptate, JSON.stringify(coduri));
}

describe("ruleazaEval", () => {
  it("compara fiecare factura cu fisierul ei asteptat", async () => {
    await scrie("01", "TEXT UNU", UNU);
    await scrie("02", "TEXT DOI", DOI);
    const extrage = extractorDupaText({ "TEXT UNU": UNU, "TEXT DOI": { ...DOI, total: 30 } });

    const { sumar } = await ruleazaEval(optiuni(extrage));

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

    const { sumar } = await ruleazaEval(optiuni(extrage, { log }));

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

    await expect(ruleazaEval(optiuni(extrage))).rejects.toThrow(/02\.json/);
    expect(extrage.texte).toEqual([]);
  });

  it("arunca o eroare care numeste fisierul cand valoarea asteptata nu e JSON", async () => {
    await scrie("01", "TEXT UNU", "{ nu e json");
    await expect(ruleazaEval(optiuni(extractorDupaText({})))).rejects.toThrow(/01\.json/);
  });

  it("arunca o eroare care numeste fisierul si campul cand valoarea asteptata nu respecta schema", async () => {
    const { total: _total, ...faraTotal } = UNU;
    await scrie("01", "TEXT UNU", JSON.stringify(faraTotal));
    await expect(ruleazaEval(optiuni(extractorDupaText({})))).rejects.toThrow(/01\.json[\s\S]*total/);
  });

  it("asteapta pauzaMs intre extrageri, nu si dupa ultima", async () => {
    await scrie("01", "TEXT UNU", UNU);
    await scrie("02", "TEXT DOI", DOI);
    const pauze: number[] = [];

    await ruleazaEval({
      extrage: extractorDupaText({ "TEXT UNU": UNU, "TEXT DOI": DOI }),
      dirFacturi,
      dirAsteptat,
      fisierCoduriAsteptate,
      dataReferinta,
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
      fisierCoduriAsteptate,
      dataReferinta,
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
      return { factura: structuredClone(facturi[text]), tokeni: { intrare: 1, iesire: 1 }, latentaMs: 1, model: "m", dinRezerva: false };
    };

    await ruleazaEval({
      extrage,
      dirFacturi,
      dirAsteptat,
      fisierCoduriAsteptate,
      dataReferinta,
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
    const LITE = "gemini-3.5-flash-lite";
    const RASPUNSURI: Record<string, Omit<RezultatExtragere, "factura">> = {
      "TEXT UNU": { tokeni: { intrare: 1000, iesire: 200 }, latentaMs: 1500, model: LITE, dinRezerva: false },
      "TEXT DOI": { tokeni: { intrare: 2000, iesire: 400 }, latentaMs: 2500, model: LITE, dinRezerva: false },
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

      const { consum } = await ruleazaEval(optiuni(extrage));

      expect(consum.facturi).toEqual([
        {
          fisier: "01.txt",
          corecte: 11,
          controale: 11,
          tokeni: { intrare: 1000, iesire: 200 },
          latentaMs: 1500,
          model: "gemini-3.5-flash-lite",
          dinRezerva: false,
          cost: expect.closeTo((1000 * 0.3 + 200 * 2.5) / 1_000_000, 15),
        },
        {
          fisier: "02.txt",
          corecte: 0,
          controale: 8,
          tokeni: { intrare: 0, iesire: 0 },
          latentaMs: null,
          model: null,
          dinRezerva: false,
          cost: 0,
        },
        {
          fisier: "03.txt",
          corecte: 8,
          controale: 8,
          tokeni: { intrare: 2000, iesire: 400 },
          latentaMs: 2500,
          model: "gemini-3.5-flash-lite",
          dinRezerva: false,
          cost: expect.closeTo((2000 * 0.3 + 400 * 2.5) / 1_000_000, 15),
        },
      ]);
      expect(consum).toMatchObject({ intrare: 3000, iesire: 600, extrase: 2, latentaMedieMs: 2000, latentaMaxMs: 2500 });
      expect(consum.cost).toBeCloseTo((3000 * 0.3 + 600 * 2.5) / 1_000_000, 15);
    });

    it("nu imparte la zero cand toate extragerile esueaza", async () => {
      await scrie("01", "TEXT STRICAT", UNU);

      const { consum } = await ruleazaEval(optiuni(extrage));

      expect(consum).toMatchObject({ intrare: 0, iesire: 0, cost: 0, costMediu: null, latentaMedieMs: null });
    });

    it("ruleaza scrie in fisierul primit exact raportul cu acuratetea si costul", async () => {
      await scrie("01", "TEXT UNU", UNU);
      await scrie("02", "TEXT DOI", DOI);
      const fisierIesire = join(dir, "rezultate", "eval.md");
      const meta = { principal: "gemini-3.5-flash-lite", rezerva: null, dataRulare: "2026-11-12" };

      const { sumar, consum, validare } = await ruleaza({
        extrage,
        dirFacturi,
        dirAsteptat,
        fisierCoduriAsteptate,
        dataReferinta,
        pauzaMs: 0,
        log: vi.fn(),
        fisierIesire,
        ...meta,
      });

      const scris = await readFile(fisierIesire, "utf8");
      expect(scris).toBe(raportEval(sumar, consum, validare, meta));
      expect(scris).toContain("## Tokeni, cost si latenta");
      expect(scris).toContain("- Tokeni intrare: 3000");
    });
  });

  describe("validare", () => {
    // 01 corecta; 02 corecta, dar totalul citit gresit; 03 cu data dupa referinta, extrasa fidel; 04 gresita si esuata.
    const TREI: Factura = { ...DOI, furnizor: "Tamplaria Trei SRL", data: "2026-11-20" };

    async function scrieSetul() {
      await scrie("01", "TEXT UNU", UNU);
      await scrie("02", "TEXT DOI", DOI);
      await scrie("03", "TEXT TREI", TREI, ["data_in_viitor"]);
      await scrie("04", "TEXT STRICAT", UNU, ["suma_diferita"]);
    }
    const extrage = extractorDupaText({ "TEXT UNU": UNU, "TEXT DOI": { ...DOI, total: 30 }, "TEXT TREI": TREI });

    it("valideaza fiecare factura extrasa si compara codurile obtinute cu cele asteptate", async () => {
      await scrieSetul();

      const { validare } = await ruleazaEval(optiuni(extrage));

      expect(validare.facturi).toEqual([
        { fisier: "01.txt", asteptate: [], obtinute: [], verdict: "corecta_ok" },
        { fisier: "02.txt", asteptate: [], obtinute: ["suma_diferita"], verdict: "corecta_semnalata" },
        {
          fisier: "03.txt",
          asteptate: ["data_in_viitor"],
          obtinute: ["data_in_viitor"],
          verdict: "gresita_coduri_asteptate",
        },
        { fisier: "04.txt", asteptate: ["suma_diferita"], obtinute: null, verdict: "extragere_esuata" },
      ]);
      expect(validare).toMatchObject({
        dataReferinta,
        gresite: 2,
        gresiteSemnalate: 1,
        corecte: 2,
        corecteOk: 1,
        total: 4,
        potrivite: 2,
      });
    });

    it("judeca data fata de data de referinta primita, nu fata de ceasul masinii", async () => {
      await scrieSetul();

      const { validare } = await ruleazaEval(optiuni(extrage, { dataReferinta: "2026-11-20" }));

      expect(validare.facturi[2]).toMatchObject({ obtinute: [], verdict: "gresita_nesemnalata" });
      expect(validare.dataReferinta).toBe("2026-11-20");
    });

    it("scrie codurile obtinute si asteptate in log", async () => {
      await scrieSetul();
      const log = vi.fn();

      await ruleazaEval(optiuni(extrage, { log }));

      expect(log.mock.calls.map(([linie]) => linie)).toEqual([
        expect.stringMatching(/^01\.txt: .*, validare: ok \(asteptat: ok\)$/),
        expect.stringMatching(/^02\.txt: .*, validare: suma_diferita \(asteptat: ok\)$/),
        expect.stringMatching(/^03\.txt: .*, validare: data_in_viitor \(asteptat: data_in_viitor\)$/),
        expect.stringMatching(/^04\.txt: extragere esuata/),
      ]);
    });

    it("arunca o eroare care numeste factura fara coduri asteptate, inainte de orice extragere", async () => {
      await scrie("01", "TEXT UNU", UNU);
      await scrie("02", "TEXT DOI", DOI);
      delete coduri["02"];
      await writeFile(fisierCoduriAsteptate, JSON.stringify(coduri));
      const extrage = extractorDupaText({ "TEXT UNU": UNU, "TEXT DOI": DOI });

      await expect(ruleazaEval(optiuni(extrage))).rejects.toThrow(/asteptat-validare\.json.*02\.txt/);
      expect(extrage.texte).toEqual([]);
    });

    it("arunca o eroare care numeste fisierul cand codurile asteptate lipsesc sau au un cod necunoscut", async () => {
      await scrie("01", "TEXT UNU", UNU);
      const extrage = extractorDupaText({});

      await expect(ruleazaEval(optiuni(extrage, { fisierCoduriAsteptate: join(dir, "lipsa.json") }))).rejects.toThrow(
        /lipsa\.json/,
      );
      await writeFile(fisierCoduriAsteptate, JSON.stringify({ "01": ["suma_gresita"] }));
      await expect(ruleazaEval(optiuni(extrage))).rejects.toThrow(
        /asteptat-validare\.json: codurile asteptate nu respecta schema[\s\S]*01/,
      );
    });

    it("foloseste pentru setul de date data de referinta fixa 2026-11-12", () => {
      expect(DATA_REFERINTA_SET).toBe("2026-11-12");
    });
  });

  it("arunca la o data de referinta invalida inainte de orice extragere", async () => {
    await scrie("01", "TEXT UNU", UNU);
    const extrage = extractorDupaText({ "TEXT UNU": UNU });

    for (const gresita of ["2026-02-30", "12.11.2026"]) {
      await expect(ruleazaEval(optiuni(extrage, { dataReferinta: gresita }))).rejects.toThrow(gresita);
    }
    expect(extrage.texte).toEqual([]);
  });

  it("numeste in log modelul care a raspuns", async () => {
    await scrie("01", "TEXT UNU", UNU);
    const log = vi.fn();
    await ruleazaEval(optiuni(extractorDupaText({ "TEXT UNU": UNU }), { log }));
    expect(log.mock.calls[0][0]).toMatch(/^01\.txt: 11\/11 controale corecte, model model-fals, tokeni /);
  });

  it("cu principalul picat si rezerva care raspunde, raportul arata rezultatele rezervei si modelul ei", async () => {
    await scrie("01", "TEXT UNU", UNU);
    const principal = new ModelCarePica(new Error("503 Service Unavailable: high demand"));
    const rezerva = new ModelCareRaspunde({
      structuredResponse: {
        raw: new AIMessage({ content: "", usage_metadata: { input_tokens: 1000, output_tokens: 200, total_tokens: 1200 } }),
        parsed: UNU,
      },
    });
    const fisierIesire = join(dir, "rezultate", "eval.md");
    const log = vi.fn();

    const { sumar, consum, validare } = await ruleaza({
      ...optiuni(creeazaExtractor(principal, "gemini-3.5-flash-lite", [{ model: rezerva, nume: "gemini-3-flash-preview" }]), {
        log,
      }),
      fisierIesire,
      principal: "gemini-3.5-flash-lite",
      rezerva: "gemini-3-flash-preview",
      dataRulare: "2026-11-12",
    });

    expect(sumar).toMatchObject({ facturi: 1, facturiComplete: 1, corecte: 11, totalControale: 11 });
    expect(validare).toMatchObject({ corecteOk: 1, potrivite: 1 });
    expect(consum.facturi[0]).toMatchObject({
      model: "gemini-3-flash-preview",
      dinRezerva: true,
      tokeni: { intrare: 1000, iesire: 200 },
    });
    expect(log.mock.calls[0][0]).toMatch(/^01\.txt: 11\/11 controale corecte, model gemini-3-flash-preview, /);
    const raport = await readFile(fisierIesire, "utf8");
    expect(raport).toContain("| 01.txt | gemini-3-flash-preview | 11/11 | 1000 | 200 |");
    expect(raport).toContain("- Facturi la care a raspuns rezerva (gemini-3-flash-preview): 1 din 1 extrase\n");
    // 1000 x 0.50 + 200 x 3.00 = 1100 / 1M tokeni, pretul rezervei
    expect(raport).toContain("- Cost total: $0.001100\n");
  });

  it("nu incarca dotenv/config la import", () => {
    expect(dotenv.incarcat).toBe(false);
  });
});
