import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { citesteFacturi, setDinArgumente } from "../src/citire.js";
import { pdfDinText } from "../src/genereaza-pdf.js";
import { textDinPdf } from "../src/pdf.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "citire-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("citesteFacturi", () => {
  it("citeste doar fisierele .txt, sortate dupa nume", async () => {
    await writeFile(join(dir, "02.txt"), "factura doi");
    await writeFile(join(dir, "01.txt"), "factura unu");
    await writeFile(join(dir, "note.md"), "nu e factura");
    await mkdir(join(dir, "dosar.txt"));

    expect(await citesteFacturi(dir)).toEqual([
      { fisier: "01.txt", text: "factura unu" },
      { fisier: "02.txt", text: "factura doi" },
    ]);
  });

  it("citeste si .txt, si .pdf din acelasi director, sortate dupa nume; PDF-ul da textul paginilor", async () => {
    const pdf = await pdfDinText("FACTURĂ TREI\nPreț: 7,25 lei\n");
    await writeFile(join(dir, "03.pdf"), pdf);
    await writeFile(join(dir, "01.txt"), "factura unu");
    await writeFile(join(dir, "02.pdf"), await pdfDinText("FACTURA DOI\n"));
    await writeFile(join(dir, "note.md"), "nu e factura");
    await mkdir(join(dir, "dosar.pdf"));

    expect(await citesteFacturi(dir)).toEqual([
      { fisier: "01.txt", text: "factura unu" },
      { fisier: "02.pdf", text: await textDinPdf(await pdfDinText("FACTURA DOI\n")) },
      { fisier: "03.pdf", text: await textDinPdf(pdf) },
    ]);
  });

  it("arunca o eroare care numeste PDF-ul care nu poate fi citit", async () => {
    await writeFile(join(dir, "01.pdf"), "nu e pdf");
    await expect(citesteFacturi(dir)).rejects.toThrow(/01\.pdf/);
  });

  it("intoarce lista goala pentru un director fara facturi", async () => {
    expect(await citesteFacturi(dir)).toEqual([]);
  });
});

describe("setDinArgumente", () => {
  it("alege textele fara argument si copiile PDF cu argumentul pdf", () => {
    expect(setDinArgumente([])).toBe("txt");
    expect(setDinArgumente(["pdf"])).toBe("pdf");
  });

  it("arunca la orice alt argument, ca o greseala de tastare sa nu ruleze pe setul gresit", () => {
    for (const argumente of [["txt"], ["PDF"], ["pdf", "pdf"], ["--pdf"]]) {
      expect(() => setDinArgumente(argumente), argumente.join(" ")).toThrow(/pdf/);
    }
  });
});
