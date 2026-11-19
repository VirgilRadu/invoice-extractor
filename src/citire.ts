import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { textDinPdf } from "./pdf.js";

export type DocumentText = { fisier: string; text: string };

// Setul pe care ruleaza o comanda: textele din date/facturi sau copiile lor din date/pdf.
export type SetIntrare = "txt" | "pdf";

// Fara argument textele, cu "pdf" copiile PDF; orice alt argument opreste comanda.
export function setDinArgumente(argumente: string[]): SetIntrare {
  if (argumente.length === 0) return "txt";
  if (argumente.length === 1 && argumente[0] === "pdf") return "pdf";
  throw new Error(`Argument necunoscut: "${argumente.join(" ")}". Fara argument: textele; cu "pdf": copiile PDF.`);
}

async function citesteFisier(dir: string, fisier: string): Promise<string> {
  if (fisier.endsWith(".txt")) return readFile(join(dir, fisier), "utf8");
  try {
    return await textDinPdf(await readFile(join(dir, fisier)));
  } catch (eroare) {
    const mesaj = eroare instanceof Error ? eroare.message : String(eroare);
    throw new Error(`${fisier}: PDF-ul nu poate fi citit: ${mesaj}`, { cause: eroare });
  }
}

// Fisierele .txt si .pdf din director, sortate dupa nume; din PDF se ia textul paginilor.
export async function citesteFacturi(dir: string): Promise<DocumentText[]> {
  const intrari = await readdir(dir, { withFileTypes: true });
  const nume = intrari
    .filter((intrare) => intrare.isFile() && /\.(txt|pdf)$/.test(intrare.name))
    .map((intrare) => intrare.name)
    .sort();
  return Promise.all(nume.map(async (fisier) => ({ fisier, text: await citesteFisier(dir, fisier) })));
}
