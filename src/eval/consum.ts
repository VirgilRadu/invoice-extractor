import { calculateCost, pricingFor } from "../lib/cost.js";

// latentaMs si model sunt null la o extragere esuata; ea are 0 tokeni.
export type ConsumFactura = {
  fisier: string;
  corecte: number;
  controale: number;
  tokeni: { intrare: number; iesire: number };
  latentaMs: number | null;
  model: string | null;
};

// cost null = modelul nu are pret in cost.ts.
export type ConsumCuCost = ConsumFactura & { cost: number | null };

export type SumarConsum = {
  facturi: ConsumCuCost[];
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

// Media costului si latenta se calculeaza doar pe extragerile reusite.
export function sumarConsum(randuri: ConsumFactura[]): SumarConsum {
  const facturi = randuri.map((rand) => ({ ...rand, cost: costFactura(rand) }));
  const latente = facturi.flatMap(({ latentaMs }) => (latentaMs === null ? [] : [latentaMs]));
  const extrase = latente.length;
  const costuri = facturi.map(({ cost }) => cost);
  const cost = costuri.includes(null) ? null : (costuri as number[]).reduce((acc, c) => acc + c, 0);

  return {
    facturi,
    intrare: facturi.reduce((acc, f) => acc + f.tokeni.intrare, 0),
    iesire: facturi.reduce((acc, f) => acc + f.tokeni.iesire, 0),
    cost,
    extrase,
    costMediu: cost === null || extrase === 0 ? null : cost / extrase,
    latentaMedieMs: extrase === 0 ? null : latente.reduce((acc, l) => acc + l, 0) / extrase,
    latentaMaxMs: extrase === 0 ? null : Math.max(...latente),
  };
}
