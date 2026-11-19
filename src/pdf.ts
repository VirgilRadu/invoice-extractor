import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// Textul tuturor paginilor, cu getTextContent, un rand pe linie (hasEOL); build-ul legacy e cel pentru Node.
// Datele se copiaza: pdfjs refuza un Buffer si poate lua in stapanire tabloul primit.
export async function textDinPdf(date: Uint8Array): Promise<string> {
  const sarcina = getDocument({ data: new Uint8Array(date) });
  try {
    const pdf = await sarcina.promise;
    const pagini: string[] = [];
    for (let numar = 1; numar <= pdf.numPages; numar += 1) {
      const { items } = await (await pdf.getPage(numar)).getTextContent();
      pagini.push(items.map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : "") : "")).join(""));
    }
    return pagini.map((pagina) => (pagina.endsWith("\n") ? pagina : `${pagina}\n`)).join("");
  } finally {
    await sarcina.destroy();
  }
}
