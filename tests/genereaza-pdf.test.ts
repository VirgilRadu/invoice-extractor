import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pdfDinText, ruleaza } from "../src/genereaza-pdf.js";
import { textDinPdf } from "../src/pdf.js";

let dir: string;
let dirFacturi: string;
let dirPdf: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "genereaza-pdf-"));
  dirFacturi = join(dir, "facturi");
  dirPdf = join(dir, "pdf");
  await mkdir(dirFacturi);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const randuri = (text: string) => text.split("\n").filter((rand) => rand !== "");

describe("pdfDinText", () => {
  it("da aceiasi octeti la doua generari ale aceluiasi text", async () => {
    const text = "FACTURĂ FISCALĂ\n  Preț: 45,50 lei\n";
    expect(Buffer.compare(await pdfDinText(text), await pdfDinText(text))).toBe(0);
  });

  it("nu rupe un rand mai lat decat pagina", async () => {
    const lung = Array.from({ length: 40 }, (_, i) => `coloana${i + 1}`).join("  ");

    expect(randuri(await textDinPdf(await pdfDinText(`${lung}\nurmatorul`)))).toEqual([
      lung.replace(/\s+/g, " "),
      "urmatorul",
    ]);
  });
});

describe("ruleaza", () => {
  it("scrie NN.pdf pentru fiecare NN.txt, doar pentru .txt, cu textul facturii", async () => {
    await writeFile(join(dirFacturi, "02.txt"), "FACTURA DOI\n");
    await writeFile(join(dirFacturi, "01.txt"), "FACTURA UNU\n");
    await writeFile(join(dirFacturi, "note.md"), "nu e factura");
    const log = vi.fn();

    await ruleaza({ dirFacturi, dirPdf, log });

    expect((await readdir(dirPdf)).sort()).toEqual(["01.pdf", "02.pdf"]);
    expect(randuri(await textDinPdf(await readFile(join(dirPdf, "01.pdf"))))).toEqual(["FACTURA UNU"]);
    expect(randuri(await textDinPdf(await readFile(join(dirPdf, "02.pdf"))))).toEqual(["FACTURA DOI"]);
    expect(log.mock.calls.map(([linie]) => linie)).toEqual([
      `Scris: ${join(dirPdf, "01.pdf")}`,
      `Scris: ${join(dirPdf, "02.pdf")}`,
      "PDF-uri: 2",
    ]);
  });

  it("rescrie aceiasi octeti la a doua rulare", async () => {
    await writeFile(join(dirFacturi, "01.txt"), "FACTURA UNU\nPreț: 1.089,05 lei\n");

    await ruleaza({ dirFacturi, dirPdf, log: vi.fn() });
    const prima = await readFile(join(dirPdf, "01.pdf"));
    await ruleaza({ dirFacturi, dirPdf, log: vi.fn() });

    expect(Buffer.compare(await readFile(join(dirPdf, "01.pdf")), prima)).toBe(0);
  });
});
