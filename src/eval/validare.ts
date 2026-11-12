import type { CodValidare } from "../validare.js";

// obtinute null = extragerea a esuat, deci factura nu a ajuns la validare.
export type ValidareFactura = { fisier: string; asteptate: CodValidare[]; obtinute: CodValidare[] | null };

export type VerdictValidare =
  | "corecta_ok"
  | "corecta_semnalata"
  | "gresita_coduri_asteptate"
  | "gresita_alte_coduri"
  | "gresita_nesemnalata"
  | "extragere_esuata";

export type SumarValidare = {
  dataReferinta: string;
  facturi: (ValidareFactura & { verdict: VerdictValidare })[];
  gresite: number;
  gresiteSemnalate: number;
  corecte: number;
  corecteOk: number;
  total: number;
  potrivite: number;
};

const aceleasiCoduri = (a: CodValidare[], b: CodValidare[]) =>
  new Set(a).size === new Set(b).size && a.every((cod) => b.includes(cod));

// Validarea asteptatului da [] la o factura corecta, deci o factura corecta semnalata are o valoare extrasa gresit.
function verdict({ asteptate, obtinute }: ValidareFactura): VerdictValidare {
  if (obtinute === null) return "extragere_esuata";
  if (asteptate.length === 0) return obtinute.length === 0 ? "corecta_ok" : "corecta_semnalata";
  if (obtinute.length === 0) return "gresita_nesemnalata";
  return aceleasiCoduri(asteptate, obtinute) ? "gresita_coduri_asteptate" : "gresita_alte_coduri";
}

// O extragere esuata nu se numara nici semnalata, nici ok, nici potrivita: validarea nu a vazut-o.
export function sumarValidare(randuri: ValidareFactura[], dataReferinta: string): SumarValidare {
  const facturi = randuri.map((rand) => ({ ...rand, verdict: verdict(rand) }));
  const numara = (...verdicte: VerdictValidare[]) => facturi.filter((f) => verdicte.includes(f.verdict)).length;
  const gresite = facturi.filter(({ asteptate }) => asteptate.length > 0).length;
  return {
    dataReferinta,
    facturi,
    gresite,
    gresiteSemnalate: numara("gresita_coduri_asteptate", "gresita_alte_coduri"),
    corecte: facturi.length - gresite,
    corecteOk: numara("corecta_ok"),
    total: facturi.length,
    potrivite: numara("corecta_ok", "gresita_coduri_asteptate"),
  };
}
