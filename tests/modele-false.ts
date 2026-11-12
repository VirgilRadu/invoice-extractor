import type { BaseMessage } from "@langchain/core/messages";
import { RunnableLambda } from "@langchain/core/runnables";
import { FakeToolCallingModel } from "langchain";

// Modelul fals care raspunde (structuredResponse) si numara de cate ori a fost apelat.
export class ModelCareRaspunde extends FakeToolCallingModel {
  apeluri = 0;

  withStructuredOutput(schema: unknown) {
    const raspuns = super.withStructuredOutput(schema);
    return new RunnableLambda({
      func: async (intrare: unknown) => {
        this.apeluri += 1;
        return raspuns.invoke(intrare);
      },
    });
  }
}

// Textul ultimului mesaj primit (textul facturii).
const textPrimit = (mesaje: unknown) => String((mesaje as BaseMessage[]).at(-1)?.content ?? "");

// Ca un provider care pica dupa reincercari: raspunsul structurat arunca, dupa intarziereMs.
// Eroarea poate depinde de textul primit, ca doua extrageri simultane sa se poata deosebi.
export class ModelCarePica extends FakeToolCallingModel {
  apeluri = 0;
  readonly eroare: Error | ((text: string) => Error);
  readonly intarziereMs: number;

  constructor(eroare: Error | ((text: string) => Error), intarziereMs = 0) {
    super();
    this.eroare = eroare;
    this.intarziereMs = intarziereMs;
  }

  withStructuredOutput(_schema: unknown) {
    return new RunnableLambda({
      func: async (mesaje: unknown): Promise<never> => {
        this.apeluri += 1;
        if (this.intarziereMs > 0) await new Promise((rezolva) => setTimeout(rezolva, this.intarziereMs));
        throw typeof this.eroare === "function" ? this.eroare(textPrimit(mesaje)) : this.eroare;
      },
    });
  }
}
