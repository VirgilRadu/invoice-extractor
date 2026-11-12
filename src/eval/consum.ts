import { calculateCost, pricingFor } from "../lib/cost.js";

// latentaMs si model sunt null la o extragere esuata; ea are 0 tokeni si dinRezerva false.
export type ConsumFactura = {
  fisier: string;
  corecte: number;
  controale: number;
  tokeni: { intrare: number; iesire: number };
  latentaMs: number | null;
  model: string | null;
  dinRezerva: boolean;
};

// cost null = modelul nu are pret in cost.ts.
export type ConsumCuCost = ConsumFactura & { cost: number | null };

// Ce a consumat fiecare model care a raspuns; cost null = model fara pret.
export type ConsumModel = { model: string; facturi: number; intrare: number; iesire: number; cost: number | null };

export type SumarConsum = {
  facturi: ConsumCuCost[];
  modele: ConsumModel[];
  deRezerva: number;
  intrare: number;
  iesire: number;
  cost: number | null;
  extrase: number;
  costMediu: number | null;
  latentaMedieMs: number | null;
  latentaMaxMs: number | null;
};

const costFactura = ({ model, tokeni }: ConsumFactura): number | null => {
  if (model === null) return 0;
  return pricingFor(model) ? calculateCost(model, tokeni.intrare, tokeni.iesire) : null;
};

// Modelele care au raspuns, in ordinea primei aparitii.
function consumPeModel(facturi: ConsumCuCost[]): ConsumModel[] {
  const modele = new Map<string, ConsumModel>();
  for (const { model, tokeni } of facturi) {
    if (model === null) continue;
    const m = modele.get(model) ?? { model, facturi: 0, intrare: 0, iesire: 0, cost: null };
    m.facturi += 1;
    m.intrare += tokeni.intrare;
    m.iesire += tokeni.iesire;
    modele.set(model, m);
  }
  return [...modele.values()].map((m) => ({
    ...m,
    cost: pricingFor(m.model) ? calculateCost(m.model, m.intrare, m.iesire) : null,
  }));
}

// Media costului si latenta se calculeaza doar pe extragerile reusite.
export function sumarConsum(randuri: ConsumFactura[]): SumarConsum {
  const facturi = randuri.map((rand) => ({ ...rand, cost: costFactura(rand) }));
  const latente = facturi.flatMap(({ latentaMs }) => (latentaMs === null ? [] : [latentaMs]));
  const extrase = latente.length;
  const costuri = facturi.map(({ cost }) => cost);
  const cost = costuri.includes(null) ? null : (costuri as number[]).reduce((acc, c) => acc + c, 0);

  return {
    facturi,
    modele: consumPeModel(facturi),
    deRezerva: facturi.filter(({ dinRezerva }) => dinRezerva).length,
    intrare: facturi.reduce((acc, f) => acc + f.tokeni.intrare, 0),
    iesire: facturi.reduce((acc, f) => acc + f.tokeni.iesire, 0),
    cost,
    extrase,
    costMediu: cost === null || extrase === 0 ? null : cost / extrase,
    latentaMedieMs: extrase === 0 ? null : latente.reduce((acc, l) => acc + l, 0) / extrase,
    latentaMaxMs: extrase === 0 ? null : Math.max(...latente),
  };
}
