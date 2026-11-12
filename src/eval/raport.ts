import { formatCost, pricingFor } from "../lib/cost.js";
import { CONTROALE_FACTURA, CONTROALE_LINIE, type Esec, type SumarEval } from "./compara.js";
import type { SumarConsum } from "./consum.js";

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

// Costul null inseamna model fara pret in cost.ts: se scrie "pret necunoscut", nu 0.
const cost = (valoare: number | null) => (valoare === null ? "pret necunoscut" : formatCost(valoare));
const ms = (valoare: number | null) => (valoare === null ? "-" : `${Math.round(valoare)} ms`);
const usd = (valoare: number) => `$${Number(valoare.toFixed(2)) === valoare ? valoare.toFixed(2) : valoare}`;

function pretFolosit(model: string): string {
  const pret = pricingFor(model);
  if (!pret) return `- Pret folosit pentru ${model}: necunoscut, modelul nu are rand in src/lib/cost.ts`;
  return (
    `- Pret folosit pentru ${model}: ${usd(pret.input)} / 1M tokeni intrare, ` +
    `${usd(pret.output)} / 1M tokeni iesire (src/lib/cost.ts)`
  );
}

export function sectiuneCost(consum: SumarConsum, model: string): string {
  const randuri = consum.facturi.map(
    (f) =>
      `| ${f.fisier} | ${f.corecte}/${f.controale} | ${f.tokeni.intrare} | ${f.tokeni.iesire} | ` +
      `${f.latentaMs === null ? "-" : Math.round(f.latentaMs)} | ${cost(f.cost)} |`,
  );
  // Fara extrageri reusite nu exista medie; pretul necunoscut ramane necunoscut.
  const costMediu = consum.cost !== null && consum.costMediu === null ? "-" : cost(consum.costMediu);
  return [
    "## Tokeni, cost si latenta",
    "",
    `- Tokeni intrare: ${consum.intrare}`,
    `- Tokeni iesire: ${consum.iesire}`,
    `- Cost total: ${cost(consum.cost)}`,
    `- Cost mediu pe factura extrasa: ${costMediu} (${consum.extrase} extrase din ${consum.facturi.length})`,
    `- Latenta medie: ${ms(consum.latentaMedieMs)}, maxima: ${ms(consum.latentaMaxMs)} (doar extragerile reusite)`,
    pretFolosit(model),
    "- Costul este calculat la pretul de lista al nivelului platit; rularea a fost facuta pe nivelul gratuit.",
    "",
    "| Fisier | Controale corecte | Tokeni intrare | Tokeni iesire | Latenta (ms) | Cost |",
    "|---|---|---|---|---|---|",
    ...randuri,
  ].join("\n");
}

export function raportEval(sumar: SumarEval, consum: SumarConsum, { model, dataRulare }: MetaRaport): string {
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
    sectiuneCost(consum, model),
    "",
    "## Rezultat pe factura",
    "",
    ...facturi,
    "",
  ].join("\n");
}
