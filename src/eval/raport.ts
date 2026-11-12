import { CONTROALE_FACTURA, CONTROALE_LINIE, type Esec, type SumarEval } from "./compara.js";

export type MetaRaport = { model: string; dataRulare: string };

const procent = (valoare: number) => `${(valoare * 100).toFixed(1)}%`;

// Textul apare intre ghilimele, ca sa se vada spatiile; valoarea lipsa (linie neextrasa) e "lipsa".
const valoare = (v: unknown) => (v === undefined ? "lipsa" : JSON.stringify(v));

const esec = ({ control, linie, asteptat, obtinut }: Esec) =>
  `  - ${linie === undefined ? "" : `linia ${linie}, `}${control}: asteptat ${valoare(asteptat)}, obtinut ${valoare(obtinut)}`;

export function tabelCampuri(sumar: SumarEval): string {
  const randuri = [...CONTROALE_FACTURA, ...CONTROALE_LINIE].map((control) => {
    const { corecte, total, acuratete } = sumar.controale[control];
    return `| ${control} | ${corecte} | ${total} | ${procent(acuratete)} |`;
  });
  return ["| Camp | Corecte | Total | Acuratete |", "|---|---|---|---|", ...randuri].join("\n");
}

export function raportEval(sumar: SumarEval, { model, dataRulare }: MetaRaport): string {
  const facturi = sumar.detalii.flatMap(({ fisier, eroare, esecuri }) => {
    if (eroare !== undefined) return [`- ${fisier}: extragere esuata: ${eroare.replace(/\s+/g, " ").trim()}`];
    if (esecuri.length === 0) return [`- ${fisier}: toate controalele corecte`];
    return [`- ${fisier}:`, ...esecuri.map(esec)];
  });
  return [
    "# Eval extractor facturi",
    "",
    `- Model: ${model}`,
    `- Data rularii: ${dataRulare}`,
    `- Facturi: ${sumar.facturi}`,
    `- Facturi complet corecte: ${sumar.facturiComplete} din ${sumar.facturi}`,
    `- Acuratete totala: ${procent(sumar.acurateteTotala)} (${sumar.corecte} din ${sumar.totalControale} controale)`,
    "",
    "## Acuratete pe camp",
    "",
    tabelCampuri(sumar),
    "",
    "## Rezultat pe factura",
    "",
    ...facturi,
    "",
  ].join("\n");
}
