import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export type DocumentText = { fisier: string; text: string };

// Fisierele .txt din director, sortate dupa nume.
export async function citesteFacturi(dir: string): Promise<DocumentText[]> {
  const intrari = await readdir(dir, { withFileTypes: true });
  const nume = intrari
    .filter((intrare) => intrare.isFile() && intrare.name.endsWith(".txt"))
    .map((intrare) => intrare.name)
    .sort();
  return Promise.all(nume.map(async (fisier) => ({ fisier, text: await readFile(join(dir, fisier), "utf8") })));
}
