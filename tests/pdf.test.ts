import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { pdfDinText } from "../src/genereaza-pdf.js";
import { textDinPdf } from "../src/pdf.js";

const randuri = (text: string) => text.split("\n").filter((rand) => rand !== "");

async function numarPagini(pdf: Uint8Array): Promise<number> {
  const sarcina = getDocument({ data: new Uint8Array(pdf) });
  try {
    return (await sarcina.promise).numPages;
  } finally {
    await sarcina.destroy();
  }
}

describe("textDinPdf", () => {
  it("intoarce fiecare rand al paginii pe randul lui, cu diacriticele", async () => {
    const pdf = await pdfDinText("FACTURĂ FISCALĂ\nPreț unitar: 1.089,05 lei\n\nBrașov · Țara Î î â ă ș ț Ă Ș Ț\n");

    expect(randuri(await textDinPdf(pdf))).toEqual([
      "FACTURĂ FISCALĂ",
      "Preț unitar: 1.089,05 lei",
      "Brașov · Țara Î î â ă ș ț Ă Ș Ț",
    ]);
  });

  it("citeste toate paginile, in ordine", async () => {
    const text = Array.from({ length: 150 }, (_, i) => `Rand ${i + 1}`).join("\n");
    const pdf = await pdfDinText(text);

    expect(await numarPagini(pdf)).toBeGreaterThan(1);
    expect(randuri(await textDinPdf(pdf))).toEqual(text.split("\n"));
  });

  it("primeste un Buffer, ca cel dat de readFile, si il lasa intreg", async () => {
    const pdf = Buffer.from(await pdfDinText("TEXT UNU"));

    expect(randuri(await textDinPdf(pdf))).toEqual(["TEXT UNU"]);
    expect(randuri(await textDinPdf(pdf))).toEqual(["TEXT UNU"]);
  });

  it("arunca la un fisier care nu e PDF", async () => {
    await expect(textDinPdf(new TextEncoder().encode("nu e pdf"))).rejects.toThrow();
  });
});
