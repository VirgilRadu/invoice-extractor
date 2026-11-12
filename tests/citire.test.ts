import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { citesteFacturi } from "../src/citire.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "citire-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("citesteFacturi", () => {
  it("citeste doar fisierele .txt, sortate dupa nume", async () => {
    await writeFile(join(dir, "02.txt"), "factura doi");
    await writeFile(join(dir, "01.txt"), "factura unu");
    await writeFile(join(dir, "03.pdf"), "nu e text");
    await writeFile(join(dir, "note.md"), "nu e factura");
    await mkdir(join(dir, "dosar.txt"));

    expect(await citesteFacturi(dir)).toEqual([
      { fisier: "01.txt", text: "factura unu" },
      { fisier: "02.txt", text: "factura doi" },
    ]);
  });

  it("intoarce lista goala pentru un director fara .txt", async () => {
    expect(await citesteFacturi(dir)).toEqual([]);
  });
});
