import { formatCost, pricingFor } from "../lib/cost.js";
import { CONTROALE_FACTURA, CONTROALE_LINIE, type Esec, type SumarEval } from "./compara.js";
import type { ConsumModel, SumarConsum } from "./consum.js";
import type { SumarValidare, VerdictValidare } from "./validare.js";

// rezerva null = rulare fara model de rezerva.
export type MetaRaport = { principal: string; rezerva: string | null; dataRulare: string };
type Modele = Pick<MetaRaport, "principal" | "rezerva">;

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

function pretFolosit({ model, facturi, intrare, iesire }: Omit<ConsumModel, "cost">): string {
  const pret = pricingFor(model);
  const antet = `- Pret folosit pentru ${model} (${facturi} facturi, ${intrare} tokeni intrare / ${iesire} iesire): `;
  if (!pret) return `${antet}necunoscut, modelul nu are rand in src/lib/cost.ts`;
  return `${antet}${usd(pret.input)} / 1M tokeni intrare, ${usd(pret.output)} / 1M tokeni iesire (src/lib/cost.ts)`;
}

// Fiecare factura e taxata cu pretul modelului care a raspuns; pretul se scrie o data pe model.
export function sectiuneCost(consum: SumarConsum, { principal, rezerva }: Modele): string {
  // Rezerva se numara dupa marcajul dinRezerva, nu dupa nume: rezerva poate avea acelasi nume de model.
  const randuri = consum.facturi.map(
    (f) =>
      `| ${f.fisier} | ${f.model ?? "-"} | ${f.corecte}/${f.controale} | ${f.tokeni.intrare} | ${f.tokeni.iesire} | ` +
      `${f.latentaMs === null ? "-" : Math.round(f.latentaMs)} | ${cost(f.cost)} |`,
  );
  // Fara extrageri reusite nu exista medie; pretul necunoscut ramane necunoscut.
  const costMediu = consum.cost !== null && consum.costMediu === null ? "-" : cost(consum.costMediu);
  const modele = consum.modele.length > 0 ? consum.modele : [{ model: principal, facturi: 0, intrare: 0, iesire: 0 }];
  return [
    "## Tokeni, cost si latenta",
    "",
    `- Tokeni intrare: ${consum.intrare}`,
    `- Tokeni iesire: ${consum.iesire}`,
    `- Cost total: ${cost(consum.cost)}`,
    `- Cost mediu pe factura extrasa: ${costMediu} (${consum.extrase} extrase din ${consum.facturi.length})`,
    `- Latenta medie: ${ms(consum.latentaMedieMs)}, maxima: ${ms(consum.latentaMaxMs)} ` +
      "(doar extragerile reusite; timpul include reincercarile si trecerea pe rezerva)",
    ...(rezerva === null
      ? []
      : [`- Facturi la care a raspuns rezerva (${rezerva}): ${consum.deRezerva} din ${consum.extrase} extrase`]),
    ...modele.map(pretFolosit),
    "- Costul este calculat la pretul de lista al nivelului platit; rularea a fost facuta pe nivelul gratuit.",
    "",
    "| Fisier | Model | Controale corecte | Tokeni intrare | Tokeni iesire | Latenta (ms) | Cost |",
    "|---|---|---|---|---|---|---|",
    ...randuri,
  ].join("\n");
}

const VERDICTE: Record<VerdictValidare, string> = {
  corecta_ok: "corecta, lasata ok",
  corecta_semnalata: "corecta, semnalata: validarea a prins o valoare extrasa gresit",
  gresita_coduri_asteptate: "gresita, semnalata cu codurile asteptate",
  gresita_alte_coduri: "gresita, semnalata cu alte coduri",
  gresita_nesemnalata: "gresita, nesemnalata",
  extragere_esuata: "extragere esuata, nevalidata",
};

// null = extragere esuata, deci nimic validat; lista goala = factura ok.
const listaCoduri = (coduri: string[] | null) =>
  coduri === null ? "n/a" : coduri.length === 0 ? "-" : coduri.join(", ");

export function sectiuneValidare(validare: SumarValidare): string {
  const randuri = validare.facturi.map(
    ({ fisier, asteptate, obtinute, verdict }) =>
      `| ${fisier} | ${listaCoduri(asteptate)} | ${listaCoduri(obtinute)} | ${VERDICTE[verdict]} |`,
  );
  return [
    "## Validare",
    "",
    `- Data de referinta: ${validare.dataReferinta}, fixa pentru setul de date, ca codurile asteptate sa ramana ` +
      "adevarate oricand ar fi rulat eval-ul (pnpm start foloseste data curenta)",
    `- Facturi gresite semnalate: ${validare.gresiteSemnalate} din ${validare.gresite}`,
    `- Facturi corecte lasate ok: ${validare.corecteOk} din ${validare.corecte}`,
    `  - din celelalte ${validare.corecte - validare.corecteOk}: ${validare.corecteEsuate} extrageri esuate ` +
      `(nevalidate), ${validare.corecteSemnalate} semnalate`,
    `- Facturi cu exact codurile asteptate: ${validare.potrivite} din ${validare.total}`,
    "- O factura corecta semnalata are o valoare extrasa gresit, prinsa de validare. " +
      "O extragere esuata nu este numarata nici semnalata, nici ok.",
    "",
    "| Fisier | Coduri asteptate | Coduri obtinute | Rezultat |",
    "|---|---|---|---|",
    ...randuri,
  ].join("\n");
}

export function raportEval(
  sumar: SumarEval,
  consum: SumarConsum,
  validare: SumarValidare,
  { principal, rezerva, dataRulare }: MetaRaport,
): string {
  const facturi = sumar.detalii.flatMap(({ fisier, eroare, esecuri }) => {
    if (eroare !== undefined) return [`- ${fisier}: extragere esuata: ${eroare.replace(/\s+/g, " ").trim()}`];
    if (esecuri.length === 0) return [`- ${fisier}: toate controalele corecte`];
    return [`- ${fisier}:`, ...esecuri.map(esec)];
  });
  return [
    "# Eval extractor facturi",
    "",
    `- Model principal: ${principal}`,
    `- Model de rezerva: ${rezerva ?? "fara rezerva"}`,
    `- Data rularii: ${dataRulare}`,
    `- Facturi: ${sumar.facturi}`,
    `- Facturi complet corecte: ${sumar.facturiComplete} din ${sumar.facturi}`,
    `- Acuratete totala: ${procent(sumar.acurateteTotala)} (${sumar.corecte} din ${sumar.totalControale} controale)`,
    `- Extrageri esuate: ${sumar.esuate} din ${sumar.facturi} ` +
      "(provider picat sau raspuns respins; controalele lor sunt numarate gresite mai sus)",
    sumar.acurateteExtrase === null
      ? "- Acuratete pe facturile extrase: - (nicio factura extrasa)"
      : `- Acuratete pe facturile extrase: ${procent(sumar.acurateteExtrase)} ` +
        `(${sumar.corecteExtrase} din ${sumar.controaleExtrase} controale, ${sumar.facturi - sumar.esuate} facturi)`,
    "",
    "## Acuratete pe camp",
    "",
    tabelCampuri(sumar),
    "",
    sectiuneValidare(validare),
    "",
    sectiuneCost(consum, { principal, rezerva }),
    "",
    "## Rezultat pe factura",
    "",
    ...facturi,
    "",
  ].join("\n");
}
