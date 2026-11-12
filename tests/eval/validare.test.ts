import { describe, expect, it } from "vitest";
import { sumarValidare } from "../../src/eval/validare.js";

const REFERINTA = "2026-11-12";

describe("sumarValidare", () => {
  // 01-03 corecte, 04-07 gresite; 02 citit gresit de model, 05 cu alte coduri, 06 nesemnalata, 07 esuata.
  const SUMAR = sumarValidare(
    [
      { fisier: "01.txt", asteptate: [], obtinute: [] },
      { fisier: "02.txt", asteptate: [], obtinute: ["suma_diferita"] },
      { fisier: "03.txt", asteptate: [], obtinute: [] },
      {
        fisier: "04.txt",
        asteptate: ["suma_diferita", "data_in_viitor"],
        obtinute: ["data_in_viitor", "suma_diferita"],
      },
      { fisier: "05.txt", asteptate: ["cui_format"], obtinute: ["cui_cifra_control"] },
      { fisier: "06.txt", asteptate: ["data_invalida"], obtinute: [] },
      { fisier: "07.txt", asteptate: ["suma_diferita"], obtinute: null },
    ],
    REFERINTA,
  );

  it("numara gresitele semnalate, corectele lasate ok si potrivirile exacte", () => {
    expect(SUMAR).toMatchObject({
      dataReferinta: REFERINTA,
      gresite: 4,
      gresiteSemnalate: 2,
      corecte: 3,
      corecteOk: 2,
      total: 7,
      potrivite: 3,
    });
  });

  it("da fiecarei facturi un verdict, in ordinea fisierelor", () => {
    expect(SUMAR.facturi.map(({ fisier, verdict }) => [fisier, verdict])).toEqual([
      ["01.txt", "corecta_ok"],
      ["02.txt", "corecta_semnalata"],
      ["03.txt", "corecta_ok"],
      ["04.txt", "gresita_coduri_asteptate"],
      ["05.txt", "gresita_alte_coduri"],
      ["06.txt", "gresita_nesemnalata"],
      ["07.txt", "extragere_esuata"],
    ]);
  });

  it("compara codurile ca multime, nu ca ordine", () => {
    const { potrivite } = sumarValidare(
      [{ fisier: "01.txt", asteptate: ["cui_format", "suma_diferita"], obtinute: ["suma_diferita", "cui_format"] }],
      REFERINTA,
    );
    expect(potrivite).toBe(1);
  });

  it("nu numara o extragere esuata nici semnalata, nici ok, nici potrivita", () => {
    const sumar = sumarValidare(
      [
        { fisier: "01.txt", asteptate: [], obtinute: null },
        { fisier: "02.txt", asteptate: ["cui_format"], obtinute: null },
      ],
      REFERINTA,
    );
    expect(sumar).toMatchObject({ gresite: 1, gresiteSemnalate: 0, corecte: 1, corecteOk: 0, potrivite: 0 });
  });
});
