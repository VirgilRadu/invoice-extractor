import type { Factura } from "./schema.js";

export const CODURI_VALIDARE = [
  "fara_linii",
  "suma_diferita",
  "data_invalida",
  "data_in_viitor",
  "cui_format",
  "cui_cifra_control",
] as const;

export type CodValidare = (typeof CODURI_VALIDARE)[number];
// extragere_esuata nu vine din validare: o pune rularea cand modelul nu a intors o factura.
export type CodProblema = CodValidare | "extragere_esuata";
export type Problema<Cod extends CodProblema = CodProblema> = { cod: Cod; mesaj: string };
export type Status = "ok" | "de_verificat";

// Epsilonul acopera doar zgomotul de virgula mobila, nu largeste toleranta.
const EPSILON = 1e-9;
const TOLERANTA_SUMA = 0.01;
const CHEIE_CUI = "753217532";

// Rotunjire la 2 zecimale, jumatatea in sus; 1e-6 dintr-un ban corecteaza 1.485 stocat ca 1.48499...
const rotunjeste = (valoare: number) => (Math.sign(valoare) * Math.round(Math.abs(valoare) * 100 + 1e-6)) / 100;

const ZILE_IN_LUNA = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const bisect = (an: number) => (an % 4 === 0 && an % 100 !== 0) || an % 400 === 0;

// Data reala in formatul YYYY-MM-DD, verificata cifra cu cifra, fara Date (care muta 31 februarie in martie).
function dataReala(data: string): boolean {
  const potrivire = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!potrivire) return false;
  const [an, luna, zi] = potrivire.slice(1).map(Number);
  if (luna < 1 || luna > 12) return false;
  const zile = luna === 2 && bisect(an) ? 29 : ZILE_IN_LUNA[luna - 1];
  return zi >= 1 && zi <= zile;
}

// Ziua locala a momentului primit, ca YYYY-MM-DD.
export function ziuaCalendaristica(moment: Date): string {
  const doua = (n: number) => String(n).padStart(2, "0");
  return `${moment.getFullYear()}-${doua(moment.getMonth() + 1)}-${doua(moment.getDate())}`;
}

function problemeLinii({ linii, total }: Factura): Problema<CodValidare>[] {
  if (linii.length === 0) return [{ cod: "fara_linii", mesaj: "factura nu are nicio linie" }];
  const suma = linii.reduce((acc, { cantitate, pret }) => acc + rotunjeste(cantitate * pret), 0);
  if (Math.abs(suma - total) <= TOLERANTA_SUMA + EPSILON) return [];
  return [{ cod: "suma_diferita", mesaj: `suma liniilor ${suma.toFixed(2)} difera de total ${total}` }];
}

// Datele YYYY-MM-DD reale se compara ca text: ordinea sirurilor este ordinea zilelor.
function problemeData({ data }: Factura, azi: string): Problema<CodValidare>[] {
  if (!dataReala(data)) {
    const mesaj = `data ${JSON.stringify(data)} nu este o data reala in formatul YYYY-MM-DD`;
    return [{ cod: "data_invalida", mesaj }];
  }
  if (data > azi) return [{ cod: "data_in_viitor", mesaj: `data ${data} este dupa ${azi}` }];
  return [];
}

// Cheia 753217532 se aliniaza la dreapta peste cifrele dinaintea cifrei de control; (suma x 10) mod 11, 10 devine 0.
function problemeCui({ cui }: Factura): Problema<CodValidare>[] {
  const cifre = cui.replace(/\s+/g, "").replace(/^ro/i, "");
  if (!/^[1-9]\d{1,9}$/.test(cifre)) {
    const mesaj = `CUI ${JSON.stringify(cui)} nu are formatul RO optional + 2-10 cifre, prima diferita de 0`;
    return [{ cod: "cui_format", mesaj }];
  }
  const corp = cifre.slice(0, -1);
  const cheie = CHEIE_CUI.slice(-corp.length);
  const suma = [...corp].reduce((acc, cifra, i) => acc + Number(cifra) * Number(cheie[i]), 0);
  const calculata = ((suma * 10) % 11) % 10;
  const tiparita = Number(cifre.at(-1));
  if (calculata === tiparita) return [];
  return [
    {
      cod: "cui_cifra_control",
      mesaj: `CUI ${JSON.stringify(cui)} are cifra de control ${tiparita}, calculul da ${calculata}`,
    },
  ];
}

export function verificaZiuaDeReferinta(azi: string): void {
  if (!dataReala(azi)) throw new Error(`Ziua de referinta ${JSON.stringify(azi)} nu este o data YYYY-MM-DD reala`);
}

// Modelul extrage, codul decide: valorile se citesc, nu se corecteaza. Ordinea: linii, data, CUI.
export function valideazaFactura(factura: Factura, azi: string): Problema<CodValidare>[] {
  verificaZiuaDeReferinta(azi);
  return [...problemeLinii(factura), ...problemeData(factura, azi), ...problemeCui(factura)];
}

export const statusFactura = (probleme: Problema[]): Status => (probleme.length === 0 ? "ok" : "de_verificat");
