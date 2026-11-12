import { z } from "zod";

// Schema permisiva: o valoare gresita trebuie sa ajunga la validare, nu sa pice parsarea.
export const SchemaFactura = z
  .object({
    furnizor: z.string().describe("Numele furnizorului (vanzatorului), exact cum apare in document"),
    cui: z
      .string()
      .describe("CUI-ul furnizorului exact cum apare in document, cu prefixul RO daca este tiparit"),
    data: z.string().describe("Data facturii, scrisa ca YYYY-MM-DD"),
    linii: z
      .array(
        z.object({
          produs: z.string().describe("Denumirea produsului sau serviciului"),
          cantitate: z.number().describe("Cantitatea de pe linie"),
          pret: z.number().describe("Pretul unitar al liniei, asa cum este tiparit in document"),
        }),
      )
      .describe("Liniile facturii, in ordinea din document"),
    total: z.number().describe("Totalul de plata, asa cum este tiparit in document"),
  })
  .describe("Datele unei facturi, exact cum apar in document");

export type Factura = z.infer<typeof SchemaFactura>;
