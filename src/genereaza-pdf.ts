// Rulare: pnpm pdf
// Pregatire de date, doar pentru dezvoltare: scrie date/pdf/NN.pdf din fiecare date/facturi/NN.txt, cu pdfkit.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import PDFDocument from "pdfkit";

// Liberation Sans (din pdfjs-dist) are ă ș ț Ă â Î î ·, pe care fonturile standard WinAnsi nu le pot desena.
const FONT = createRequire(import.meta.url).resolve("pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf");
// Data fixa si fluxuri necomprimate: aceiasi octeti la fiecare rulare, oricare ar fi zlib-ul masinii.
const DATA_CREARE = new Date(Date.UTC(2026, 10, 12));
const MARGINE = 40;
const MARIME_MAXIMA = 10;

// Fiecare rand e desenat asa cum e, la inaltimea lui, fara rupere automata; pagina noua cand se umple.
// Randul cel mai lat da marimea fontului, ca sa incapa pe latimea paginii.
export async function pdfDinText(text: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: MARGINE, compress: false, info: { CreationDate: DATA_CREARE } });
  const bucati: Buffer[] = [];
  doc.on("data", (bucata: Buffer) => bucati.push(bucata));
  const gata = new Promise<void>((rezolva, respinge) => {
    doc.on("end", rezolva);
    doc.on("error", respinge);
  });

  const randuri = text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  doc.font(FONT).fontSize(MARIME_MAXIMA);
  const latimeUtila = doc.page.width - 2 * MARGINE;
  const latimeMaxima = Math.max(...randuri.map((rand) => doc.widthOfString(rand)));
  const marime = latimeMaxima > latimeUtila ? (MARIME_MAXIMA * latimeUtila) / latimeMaxima : MARIME_MAXIMA;
  doc.fontSize(marime);
  const pas = marime * 1.3;

  let y = MARGINE;
  for (const rand of randuri) {
    if (y + pas > doc.page.height - MARGINE) {
      doc.addPage();
      y = MARGINE;
    }
    if (rand.trim() !== "") doc.text(rand, MARGINE, y, { lineBreak: false });
    y += pas;
  }
  doc.end();
  await gata;
  return Buffer.concat(bucati);
}

export type OptiuniGenerare = { dirFacturi: string; dirPdf: string; log: (linie: string) => void };

// Un NN.pdf pentru fiecare NN.txt, in ordinea numelor; PDF-urile existente se rescriu.
export async function ruleaza({ dirFacturi, dirPdf, log }: OptiuniGenerare): Promise<void> {
  const intrari = await readdir(dirFacturi, { withFileTypes: true });
  const nume = intrari
    .filter((intrare) => intrare.isFile() && intrare.name.endsWith(".txt"))
    .map((intrare) => intrare.name)
    .sort();
  await mkdir(dirPdf, { recursive: true });
  for (const fisier of nume) {
    const tinta = join(dirPdf, fisier.replace(/\.txt$/, ".pdf"));
    await writeFile(tinta, await pdfDinText(await readFile(join(dirFacturi, fisier), "utf8")));
    log(`Scris: ${tinta}`);
  }
  log(`PDF-uri: ${nume.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await ruleaza({
    dirFacturi: fileURLToPath(new URL("../date/facturi/", import.meta.url)),
    dirPdf: fileURLToPath(new URL("../date/pdf/", import.meta.url)),
    log: console.log,
  });
}
