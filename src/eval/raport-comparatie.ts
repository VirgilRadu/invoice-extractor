import { pricingFor, randPret } from "../lib/cost.js";
import { CONTROALE_FACTURA, CONTROALE_LINIE, type Scor } from "./compara.js";
import type { RulareSalvata } from "./comparatie.js";
import { esec, procent, usd, VERDICTE } from "./raport.js";
import type { RezultatEval } from "./ruleaza.js";
import type { VerdictValidare } from "./validare.js";

// Rularea salvata si notarea ei fata de set.
export type RulareNotata = { salvata: RulareSalvata; eval: RezultatEval };
// rezultateBrute spune unde stau rularile salvate, relativ la raport.
export type MetaComparatie = { rezultateBrute: string };

export type Cauza = "503" | "429" | "alta";
const CAUZE: Cauza[] = ["503", "429", "alta"];

// Cauza unei extrageri esuate, din codul HTTP din eroarea salvata: 503 provider indisponibil, 429 cota depasita.
export function cauzaEsec(eroare: string): Cauza {
  const cod = /\b(503|429)\b/.exec(eroare)?.[1];
  return cod === "503" || cod === "429" ? cod : "alta";
}

const ora = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
const secunde = (ms: number | null) => (ms === null ? "-" : `${(ms / 1000).toFixed(1)} s`);
const eticheta = ({ salvata }: RulareNotata) => `${salvata.model} #${salvata.rulare}`;
const unice = <T>(valori: T[]) => [...new Set(valori)];
const coduri = (lista: string[]) => (lista.length === 0 ? "-" : lista.join(", "));
const suma = (valori: number[]) => valori.reduce((acc, v) => acc + v, 0);

// Validarea e exacta cand factura corecta ramane ok si cea gresita are exact codurile asteptate.
const EXACTE: VerdictValidare[] = ["corecta_ok", "gresita_coduri_asteptate"];

// Cifrele unei rulari din care se scriu tabelele si constatarea.
function cifre({ eval: { sumar, validare } }: RulareNotata) {
  const cauze = Object.fromEntries(CAUZE.map((c) => [c, 0])) as Record<Cauza, number>;
  for (const { eroare } of sumar.detalii) if (eroare !== undefined) cauze[cauzaEsec(eroare)] += 1;
  const esuata = (verdict: VerdictValidare) => verdict === "extragere_esuata";
  const validate = validare.facturi.filter(({ verdict }) => !esuata(verdict));
  return {
    extrase: sumar.facturi - sumar.esuate,
    cauze,
    cititeGresit: sumar.controaleExtrase - sumar.corecteExtrase,
    pierduteLaEsec: sumar.totalControale - sumar.controaleExtrase,
    validareDiferita: validate.filter(({ verdict }) => !EXACTE.includes(verdict)).length,
    validate: validate.length,
    gresiteNeextrase: validare.facturi.filter(({ verdict, asteptate }) => esuata(verdict) && asteptate.length > 0).length,
  };
}

const textCauze = (cauze: Record<Cauza, number>) =>
  CAUZE.filter((c) => cauze[c] > 0)
    .map((c) => `${cauze[c]} x ${c}`)
    .join(", ");

const cauzeTotale = (rulari: RulareNotata[]) =>
  Object.fromEntries(CAUZE.map((c) => [c, suma(rulari.map((r) => cifre(r).cauze[c]))])) as Record<Cauza, number>;

// Un model fara rand in cost.ts are "pret necunoscut" si cand nu a raspuns la nimic: un cost 0 ar parea gratuit.
function cost(rulare: RulareNotata, pe: "total" | "factura"): string {
  const { consum } = rulare.eval;
  if (randPret(rulare.salvata.model) === undefined || consum.cost === null) return "pret necunoscut";
  if (pe === "total") return `$${consum.cost.toFixed(6)}`;
  return consum.costMediu === null ? "-" : `$${consum.costMediu.toFixed(6)}`;
}

const peFacturaExtrasa = (total: number, extrase: number) => (extrase === 0 ? "-" : String(Math.round(total / extrase)));
const neextrase = (n: number) => (n === 0 ? "" : ` (neextrase: ${n})`);

type Masura = { nume: string; valoare: (rulare: RulareNotata) => string };

const INCEPUT: Masura = { nume: "Inceput", valoare: ({ salvata }) => ora(salvata.inceput) };

// Pe extrase = acuratetea; din toate = acuratetea amestecata cu disponibilitatea. Latenta e doar a extragerilor reusite.
const REZULTATE: Masura[] = [
  { nume: "Facturi extrase", valoare: (r) => `${cifre(r).extrase}/${r.eval.sumar.facturi}` },
  {
    nume: "Extrageri esuate",
    valoare: (r) => {
      const { esuate, facturi } = r.eval.sumar;
      return esuate === 0 ? `0/${facturi}` : `${esuate}/${facturi} (${textCauze(cifre(r).cauze)})`;
    },
  },
  {
    nume: "Controale corecte, pe extrase",
    valoare: ({ eval: { sumar } }) =>
      sumar.acurateteExtrase === null
        ? "-"
        : `${sumar.corecteExtrase}/${sumar.controaleExtrase} (${procent(sumar.acurateteExtrase)})`,
  },
  { nume: "Controale corecte, din toate", valoare: ({ eval: { sumar } }) => `${sumar.corecte}/${sumar.totalControale}` },
  { nume: "Facturi complet corecte, din extrase", valoare: (r) => `${r.eval.sumar.facturiComplete}/${cifre(r).extrase}` },
  { nume: "Facturi complet corecte, din toate", valoare: ({ eval: { sumar } }) => `${sumar.facturiComplete}/${sumar.facturi}` },
  { nume: "Tokeni intrare pe factura extrasa", valoare: (r) => peFacturaExtrasa(r.eval.consum.intrare, cifre(r).extrase) },
  { nume: "Tokeni iesire pe factura extrasa", valoare: (r) => peFacturaExtrasa(r.eval.consum.iesire, cifre(r).extrase) },
  { nume: "Cost pe factura extrasa", valoare: (r) => cost(r, "factura") },
  { nume: "Tokeni intrare, total", valoare: ({ eval: { consum } }) => String(consum.intrare) },
  { nume: "Tokeni iesire, total", valoare: ({ eval: { consum } }) => String(consum.iesire) },
  { nume: "Cost total", valoare: (r) => cost(r, "total") },
  { nume: "Latenta medie", valoare: ({ eval: { consum } }) => secunde(consum.latentaMedieMs) },
  { nume: "Latenta mediana", valoare: ({ eval: { consum } }) => secunde(consum.latentaMedianaMs) },
  { nume: "Latenta maxima", valoare: ({ eval: { consum } }) => secunde(consum.latentaMaxMs) },
];

// O factura neextrasa nu a ajuns la validare: se numara separat, nu ca semnalata sau ok.
const VALIDARE: Masura[] = [
  {
    nume: "Gresite semnalate, din cele extrase",
    valoare: (r) => {
      const { gresite, gresiteSemnalate } = r.eval.validare;
      const { gresiteNeextrase } = cifre(r);
      return `${gresiteSemnalate}/${gresite - gresiteNeextrase}${neextrase(gresiteNeextrase)}`;
    },
  },
  {
    nume: "Corecte lasate ok, din cele extrase",
    valoare: ({ eval: { validare } }) =>
      `${validare.corecteOk}/${validare.corecte - validare.corecteEsuate}${neextrase(validare.corecteEsuate)}`,
  },
  { nume: "Coduri exacte, din cele extrase", valoare: (r) => `${r.eval.validare.potrivite}/${cifre(r).validate}` },
  { nume: "Gresite semnalate, din toate", valoare: ({ eval: { validare } }) => `${validare.gresiteSemnalate}/${validare.gresite}` },
  { nume: "Corecte lasate ok, din toate", valoare: ({ eval: { validare } }) => `${validare.corecteOk}/${validare.corecte}` },
];

const rand = (celule: (string | number)[]) => `| ${celule.join(" | ")} |`;
const tabel = (antet: string[], randuri: (string | number)[][]) =>
  [rand(antet), `|${antet.map(() => "---").join("|")}|`, ...randuri.map(rand)].join("\n");

// Masurile pe randuri, rularile pe coloane: fiecare rulare in coloana ei.
const tabelMasuri = (rulari: RulareNotata[], coloana: (r: RulareNotata) => string, masuri: Masura[]) =>
  tabel(
    ["Masura", ...rulari.map(coloana)],
    masuri.map(({ nume, valoare }) => [nume, ...rulari.map((r) => valoare(r))]),
  );

export const rezumatRulare = (rulare: RulareNotata) =>
  `${eticheta(rulare)}: ${[...REZULTATE, ...VALIDARE].map(({ nume, valoare }) => `${nume.toLowerCase()} ${valoare(rulare)}`).join(", ")}`;

// Rularile fiecarui model, in ordinea primei aparitii.
function peModel(rulari: RulareNotata[]): [string, RulareNotata[]][] {
  const grupuri = new Map<string, RulareNotata[]>();
  for (const rulare of rulari) grupuri.set(rulare.salvata.model, [...(grupuri.get(rulare.salvata.model) ?? []), rulare]);
  return [...grupuri.entries()];
}

function antet(rulari: RulareNotata[], { rezultateBrute }: MetaComparatie): string[] {
  const din = <T>(camp: (s: RulareSalvata) => T) => unice(rulari.map(({ salvata }) => camp(salvata)));
  const provideri = din((s) => s.provider);
  const reincercari = din((s) => s.reincercari);
  const { sumar } = rulari[0].eval;
  return [
    "# Comparatie intre modele",
    "",
    provideri.length === 1
      ? `- Compara modele ale aceluiasi provider (${provideri[0]}), nu provideri diferiti`
      : `- Rularile vin de la mai multi provideri: ${provideri.join(", ")}`,
    `- Intrare: ${din((s) => s.intrare).join("; ")}: ${sumar.facturi} facturi, ${sumar.totalControale} controale pe rulare`,
    `- Data de referinta pentru validare: ${din((s) => s.dataReferinta).join(", ")}`,
    reincercari.length === 1
      ? `- Fiecare model are extractorul lui, fara rezerva, cu aceleasi reincercari la toate rularile: maxRetries ${reincercari[0]}`
      : "- Fiecare model are extractorul lui, fara rezerva; reincercarile difera intre rulari: " +
        rulari.map((r) => `${eticheta(r)}: maxRetries ${r.salvata.reincercari}`).join(", "),
    `- Facturile se extrag pe rand, cu ${din((s) => s.pauzaMs).join(" / ")} ms intre apeluri; \`pnpm compara\` merge in runde ` +
      "(prima rulare a fiecarui model, apoi a doua); ora de inceput a fiecarei rulari este in tabel",
    "- Costul: tokenii fiecarei facturi la pretul de lista din src/lib/cost.ts al modelului care a raspuns; " +
      "rularile au fost facute pe nivelul gratuit",
    "- Latenta: doar extragerile reusite; include reincercarile, care nu sunt inregistrate separat",
    "- Extragerile esuate, dupa eroarea salvata: 503 = provider indisponibil, 429 = cota depasita, alta = orice alta eroare",
    `- Rezultatele fiecarei rulari, factura cu factura: ${rezultateBrute}; \`pnpm compara:raport\` reface acest raport ` +
      "din ele, fara apeluri la model",
  ];
}

// Constatarea se scrie din date: citirile gresite si validarea pe extrase, apoi extragerile esuate pe cauze.
function constatare(rulari: RulareNotata[]): string {
  const esuate = textCauze(cauzeTotale(rulari));
  const faraExtrase = rulari.filter((r) => cifre(r).extrase === 0).map(eticheta);
  const notaFaraExtrase = faraExtrase.length === 0 ? "" : ` Fara nicio factura extrasa: ${faraExtrase.join(", ")}.`;
  const cuGreseli = rulari.filter((r) => cifre(r).cititeGresit > 0 || cifre(r).validareDiferita > 0);
  if (cuGreseli.length === 0) {
    if (esuate === "") {
      return "Fiecare rulare are 100% controale corecte si validarea exacta, fara extrageri esuate: rularile nu separa modelele dupa acuratete.";
    }
    return (
      "Pe facturile extrase fiecare rulare are 100% controale corecte si validarea exacta; " +
      `toate diferentele vin din extragerile esuate (${esuate}).${notaFaraExtrase}`
    );
  }
  const greseli = cuGreseli.map((r) => {
    const { cititeGresit, validareDiferita } = cifre(r);
    const parti = [
      ...(cititeGresit > 0 ? [`${cititeGresit} controale gresite din ${r.eval.sumar.controaleExtrase}`] : []),
      ...(validareDiferita > 0 ? [`${validareDiferita} facturi cu validarea diferita de cea asteptata`] : []),
    ];
    return `${eticheta(r)} are ${parti.join(" si ")}`;
  });
  const restul =
    cuGreseli.length === rulari.length ? "" : "; celelalte rulari au 100% controale corecte si validarea exacta";
  return (
    `Pe facturile extrase nu toate rularile sunt corecte: ${greseli.join("; ")}${restul}. ` +
    `${esuate === "" ? "Nicio extragere esuata." : `Extrageri esuate: ${esuate}.`}${notaFaraExtrase}`
  );
}

// De unde vine diferenta dintre rularile aceluiasi model: controale pierdute la esec sau citite gresit.
function sursaVariatiei(rulari: RulareNotata[]): string {
  const toateLaFel = (valori: number[]) => valori.every((v) => v === valori[0]);
  const citite = toateLaFel(rulari.map((r) => cifre(r).cititeGresit));
  const pierdute = toateLaFel(rulari.map((r) => cifre(r).pierduteLaEsec));
  if (citite && pierdute) return "rularile au acelasi rezultat";
  if (citite) return "toata diferenta vine din extragerile esuate";
  if (pierdute) return "toata diferenta vine din citiri gresite";
  return "diferenta vine si din extragerile esuate, si din citiri gresite";
}

function ceSepara(rulari: RulareNotata[]): string[] {
  const { sumar, validare } = rulari[0].eval;
  const grupuri = peModel(rulari);
  const multiple = grupuri.filter(([, r]) => r.length > 1);
  const singure = grupuri.filter(([, r]) => r.length === 1).map(([model]) => model);
  const oFactura = (din: number) => (din === 0 ? "-" : procent(1 / din));
  const si = (r: RulareNotata[], valoare: (r: RulareNotata) => string | number) => r.map(valoare).join(" si ");
  const variatie = multiple.map(
    ([model, r]) =>
      `  - ${model}: ${si(r, (x) => x.eval.sumar.corecte)} controale corecte din ${sumar.totalControale}; ` +
      `pe facturile extrase ${si(r, (x) => `${x.eval.sumar.corecteExtrase}/${x.eval.sumar.controaleExtrase}`)}; ` +
      `extrageri esuate ${si(r, (x) => x.eval.sumar.esuate)}; ${sursaVariatiei(r)}`,
  );
  const latente = multiple.map(([model, r]) => `${model} ${si(r, (x) => secunde(x.eval.consum.latentaMedianaMs))}`);
  const esuate = textCauze(cauzeTotale(rulari));
  const latenta = "Latenta depinde de ora rularii si include reincercarile, care nu sunt inregistrate separat.";
  return [
    "## Ce poate si ce nu poate separa o rulare",
    "",
    `- O rulare are ${sumar.facturi} facturi si ${sumar.totalControale} controale. O extragere esuata are toate controalele ` +
      "ei gresite, deci controalele din toate facturile amesteca citirea cu disponibilitatea; acuratetea se citeste pe " +
      "facturile extrase.",
    ...(multiple.length === 0
      ? ["- Niciun model nu are doua rulari, deci variatia de la o rulare la alta nu se vede."]
      : [
          "- Cat variaza acelasi model de la o rulare la alta (o diferenta intre modele care nu trece de aceasta variatie " +
            "nu le separa):",
          ...variatie,
        ]),
    ...(multiple.length > 0 && singure.length > 0 ? [`- Cu o singura rulare variatia nu se vede: ${singure.join(", ")}.`] : []),
    `- Validarea are ${validare.gresite} facturi gresite si ${validare.corecte} corecte: o singura factura muta rezultatul ` +
      `cu ${oFactura(validare.gresite)}, respectiv ${oFactura(validare.corecte)}.`,
    esuate === ""
      ? "- Nicio extragere nu a esuat."
      : `- Extragerile esuate (${esuate} in toate rularile) arata cat de disponibil a fost modelul la ora rularii, ` +
        "nu cat de bine extrage.",
    latente.length === 0
      ? `- ${latenta}`
      : `- Latenta mediana a aceluiasi model de la o rulare la alta: ${latente.join("; ")}. ${latenta}`,
    "- O factura esuata nu are tokeni, deci costul total scade cu extragerile esuate; costul se compara pe factura extrasa.",
  ];
}

function pret(model: string): string {
  const randul = randPret(model);
  const pretRand = pricingFor(model);
  if (randul === undefined || !pretRand) {
    return '- Pret: necunoscut, modelul nu are rand in src/lib/cost.ts; costul se scrie "pret necunoscut", nu zero';
  }
  const prefix = randul === model.toLowerCase() ? "" : " (cel mai lung prefix al numelui)";
  return (
    `- Pret: randul \`${randul}\` din src/lib/cost.ts${prefix}: ` +
    `${usd(pretRand.input)} / 1M tokeni intrare, ${usd(pretRand.output)} / 1M tokeni iesire`
  );
}

// Erorile lungi se scurteaza; mesajul intreg ramane in rularea salvata.
const scurt = (mesaj: string) => {
  const linie = mesaj.replace(/\s+/g, " ").trim();
  return linie.length > 200 ? `${linie.slice(0, 200)} ...` : linie;
};

// Ce a iesit altfel decat asteptat; o extragere esuata apare o data, la facturi, nu si la validare.
function abateri({ eval: { sumar, validare } }: RulareNotata): string[] {
  const facturi = sumar.detalii.flatMap(({ fisier, eroare, esecuri }) => {
    if (eroare !== undefined) return [`- ${fisier}: extragere esuata: ${scurt(eroare)}`];
    return esecuri.length === 0 ? [] : [`- ${fisier}:`, ...esecuri.map(esec)];
  });
  const validari = validare.facturi
    .filter(({ verdict }) => verdict !== "extragere_esuata" && !EXACTE.includes(verdict))
    .map(
      ({ fisier, asteptate, obtinute, verdict }) =>
        `  - ${fisier}: ${VERDICTE[verdict]} (coduri asteptate: ${coduri(asteptate)}, obtinute: ${coduri(obtinute ?? [])})`,
    );
  if (facturi.length === 0 && validari.length === 0) {
    return ["- Toate facturile extrase, toate controalele corecte, validarea cu codurile asteptate la fiecare factura"];
  }
  return [...facturi, ...(validari.length === 0 ? [] : ["- Validare diferita de cea asteptata:", ...validari])];
}

function sectiuneModel(model: string, rulari: RulareNotata[]): string[] {
  const alaturate =
    rulari.length === 1 ? [] : ["", tabelMasuri(rulari, ({ salvata }) => `Rulare ${salvata.rulare}`, [INCEPUT, ...REZULTATE, ...VALIDARE])];
  return [
    `## ${model}`,
    "",
    pret(model),
    rulari.length === 1 ? "- Rulari: 1; variatia de la o rulare la alta nu se vede" : `- Rulari: ${rulari.length}, alaturate mai jos`,
    ...alaturate,
    ...rulari.flatMap((rulare) => ["", `### ${model}, rularea ${rulare.salvata.rulare}`, "", ...abateri(rulare)]),
  ];
}

const peCamp = (rulari: RulareNotata[], celula: (scor: Scor) => string, scoruri: (r: RulareNotata) => Record<string, Scor>) =>
  tabel(
    ["Camp", ...rulari.map(eticheta)],
    [...CONTROALE_FACTURA, ...CONTROALE_LINIE].map((control) => [control, ...rulari.map((r) => celula(scoruri(r)[control]))]),
  );

// Fiecare rulare apare in coloana ei, in ordinea primita; nicio rulare nu este aleasa sau lasata deoparte.
export function raportComparatie(rulari: RulareNotata[], meta: MetaComparatie): string {
  if (rulari.length === 0) throw new Error("Comparatia nu are nicio rulare");
  return [
    ...antet(rulari, meta),
    "",
    "## Constatare",
    "",
    constatare(rulari),
    "",
    ...ceSepara(rulari),
    "",
    "## Fiecare rulare",
    "",
    tabelMasuri(rulari, eticheta, [INCEPUT, ...REZULTATE]),
    "",
    "## Validare, fiecare rulare",
    "",
    "Pe facturile extrase se vede validarea; o factura neextrasa nu a ajuns la validare.",
    "",
    tabelMasuri(rulari, eticheta, VALIDARE),
    "",
    "## Acuratete pe camp, pe facturile extrase",
    "",
    "Controale corecte din controalele facturilor extrase; extragerile esuate nu intra aici.",
    "",
    peCamp(
      rulari,
      ({ corecte, total, acuratete }) => (total === 0 ? "-" : `${procent(acuratete)} (${corecte}/${total})`),
      (r) => r.eval.sumar.campuriExtrase,
    ),
    "",
    "## Controale corecte pe camp, din toate facturile",
    "",
    "O extragere esuata are toate controalele gresite, deci aici scad si extragerile esuate.",
    "",
    peCamp(rulari, ({ corecte, total }) => `${corecte}/${total}`, (r) => r.eval.sumar.controale),
    ...peModel(rulari).flatMap(([model, r]) => ["", ...sectiuneModel(model, r)]),
    "",
  ].join("\n");
}
