# Cerințe — Tema 7: Extractor de facturi și bonuri

Din text sau PDF extrage datele facturii, le validează și le exportă în CSV.

Laburi: L6, L2-3, L1

## Niveluri

- **Minim:** facturi sintetice ca text. Schemă Zod: furnizor, CUI, dată, linii (produs, cantitate, preț), total. 15 facturi. Eval: câmpuri corecte față de valorile reale. Export în CSV, scris direct din cod.
- **Bun:** validare în cod: suma liniilor egală cu totalul, dată validă, CUI în format corect. Facturile care nu trec sunt marcate pentru verificare manuală, nu corectate în tăcere. Fallback de provider cu `withFallbacks`.
- **Avansat:** facturi ca PDF, citite cu `pdfjs-dist` ca în L11 (textul paginii, nu extractorul de cărți). Comparație între 2-3 provideri pe același set: acuratețe pe câmp, cost și latență.

## Restricție

Doar ce s-a făcut în laburile 1-12. Fără persistence/HITL avansat (L13), fără multi-agent (L14-15), fără LangSmith (L18). Ce ar merita adăugat după acele laburi se notează în README, nu se implementează.

## Cerințe comune

1. README cu: ce face proiectul, cum se rulează (o singură comandă), ce chei de API trebuie setate și ce costă o rulare.
2. `llm.ts` comutabil: providerul se schimbă dintr-o variabilă de mediu, nu din cod.
3. Cel puțin un test offline care rulează fără cheie de API, cu model fals. Pentru `withStructuredOutput`: `FakeToolCallingModel({ structuredResponse })`. Modelul fals întoarce mereu același răspuns, deci testul verifică codul din jurul modelului (reguli, rutare, parsare), nu calitatea modelului.
4. Un set de eval de minimum 15 exemple, cu rezultatul măsurat (acuratețe).
5. Un raport de cost: câți tokeni și cât a costat rularea pe setul de eval, calculat cu `cost.ts`.
6. Date sintetice sau publice. Fără date personale reale.
7. Codul compilează: `tsc --noEmit` trece fără erori.

## Ce se predă

- linkul la repository;
- README cu nivelul atins și rezultatele eval;
- un paragraf: ce n-a mers și ce aș face diferit.
