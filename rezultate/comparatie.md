# Comparatie intre modele

- Compara modele ale aceluiasi provider (gemini), nu provideri diferiti
- Intrare: date/pdf (PDF, textul paginilor citit cu pdfjs-dist): 20 facturi, 334 controale pe rulare
- Data de referinta pentru validare: 2026-11-12
- Fiecare model are extractorul lui, fara rezerva, cu aceleasi reincercari la toate rularile: maxRetries 2
- Facturile se extrag pe rand, cu 4500 ms intre apeluri; `pnpm compara` merge in runde (prima rulare a fiecarui model, apoi a doua); ora de inceput a fiecarei rulari este in tabel
- Costul: tokenii fiecarei facturi la pretul de lista din src/lib/cost.ts al modelului care a raspuns; rularile au fost facute pe nivelul gratuit
- Latenta: doar extragerile reusite; include reincercarile, care nu sunt inregistrate separat
- Extragerile esuate, dupa eroarea salvata: 503 = provider indisponibil, 429 = cota depasita, alta = orice alta eroare
- Rezultatele fiecarei rulari, factura cu factura: comparatie/<model>-<n>.json; `pnpm compara:raport` reface acest raport din ele, fara apeluri la model

## Constatare

Pe facturile extrase fiecare rulare are 100% controale corecte si validarea exacta; toate diferentele vin din extragerile esuate (10 x 503, 4 x 429).

## Ce poate si ce nu poate separa o rulare

- O rulare are 20 facturi si 334 controale. O extragere esuata are toate controalele ei gresite, deci controalele din toate facturile amesteca citirea cu disponibilitatea; acuratetea se citeste pe facturile extrase.
- Cat variaza acelasi model de la o rulare la alta (o diferenta intre modele care nu trece de aceasta variatie nu le separa):
  - gemini-3.5-flash-lite: 269 si 300 controale corecte din 334; pe facturile extrase 269/269 si 300/300; extrageri esuate 4 si 2; toata diferenta vine din extragerile esuate
  - gemini-3.1-flash-lite: 289 si 334 controale corecte din 334; pe facturile extrase 289/289 si 334/334; extrageri esuate 3 si 0; toata diferenta vine din extragerile esuate
- Cu o singura rulare variatia nu se vede: gemini-3-flash-preview.
- Validarea are 5 facturi gresite si 15 corecte: o singura factura muta rezultatul cu 20.0%, respectiv 6.7%.
- Extragerile esuate (10 x 503, 4 x 429 in toate rularile) arata cat de disponibil a fost modelul la ora rularii, nu cat de bine extrage.
- Latenta mediana a aceluiasi model de la o rulare la alta: gemini-3.5-flash-lite 60.0 s si 10.9 s; gemini-3.1-flash-lite 7.2 s si 19.1 s. Latenta depinde de ora rularii si include reincercarile, care nu sunt inregistrate separat.
- O factura esuata nu are tokeni, deci costul total scade cu extragerile esuate; costul se compara pe factura extrasa.

## Fiecare rulare

| Masura | gemini-3.5-flash-lite #1 | gemini-3.5-flash-lite #2 | gemini-3.1-flash-lite #1 | gemini-3.1-flash-lite #2 | gemini-3-flash-preview #1 |
|---|---|---|---|---|---|
| Inceput | 2026-11-19 15:42 UTC | 2026-11-19 16:56 UTC | 2026-11-19 16:10 UTC | 2026-11-19 17:06 UTC | 2026-11-19 16:24 UTC |
| Facturi extrase | 16/20 | 18/20 | 17/20 | 20/20 | 15/20 |
| Extrageri esuate | 4/20 (4 x 503) | 2/20 (2 x 503) | 3/20 (3 x 503) | 0/20 | 5/20 (1 x 503, 4 x 429) |
| Controale corecte, pe extrase | 269/269 (100.0%) | 300/300 (100.0%) | 289/289 (100.0%) | 334/334 (100.0%) | 249/249 (100.0%) |
| Controale corecte, din toate | 269/334 | 300/334 | 289/334 | 334/334 | 249/334 |
| Facturi complet corecte, din extrase | 16/16 | 18/18 | 17/17 | 20/20 | 15/15 |
| Facturi complet corecte, din toate | 16/20 | 18/20 | 17/20 | 20/20 | 15/20 |
| Tokeni intrare pe factura extrasa | 391 | 371 | 361 | 369 | 367 |
| Tokeni iesire pe factura extrasa | 254 | 251 | 252 | 246 | 1036 |
| Cost pe factura extrasa | $0.000752 | $0.000739 | $0.000468 | $0.000461 | $0.003293 |
| Tokeni intrare, total | 6262 | 6676 | 6134 | 7386 | 5501 |
| Tokeni iesire, total | 4060 | 4517 | 4279 | 4920 | 15546 |
| Cost total | $0.012029 | $0.013295 | $0.007952 | $0.009227 | $0.049389 |
| Latenta medie | 91.9 s | 22.7 s | 18.4 s | 30.7 s | 94.0 s |
| Latenta mediana | 60.0 s | 10.9 s | 7.2 s | 19.1 s | 31.2 s |
| Latenta maxima | 346.6 s | 81.6 s | 73.9 s | 167.3 s | 311.9 s |

## Validare, fiecare rulare

Pe facturile extrase se vede validarea; o factura neextrasa nu a ajuns la validare.

| Masura | gemini-3.5-flash-lite #1 | gemini-3.5-flash-lite #2 | gemini-3.1-flash-lite #1 | gemini-3.1-flash-lite #2 | gemini-3-flash-preview #1 |
|---|---|---|---|---|---|
| Gresite semnalate, din cele extrase | 4/4 (neextrase: 1) | 4/4 (neextrase: 1) | 3/3 (neextrase: 2) | 5/5 | 1/1 (neextrase: 4) |
| Corecte lasate ok, din cele extrase | 12/12 (neextrase: 3) | 14/14 (neextrase: 1) | 14/14 (neextrase: 1) | 15/15 | 14/14 (neextrase: 1) |
| Coduri exacte, din cele extrase | 16/16 | 18/18 | 17/17 | 20/20 | 15/15 |
| Gresite semnalate, din toate | 4/5 | 4/5 | 3/5 | 5/5 | 1/5 |
| Corecte lasate ok, din toate | 12/15 | 14/15 | 14/15 | 15/15 | 14/15 |

## Acuratete pe camp, pe facturile extrase

Controale corecte din controalele facturilor extrase; extragerile esuate nu intra aici.

| Camp | gemini-3.5-flash-lite #1 | gemini-3.5-flash-lite #2 | gemini-3.1-flash-lite #1 | gemini-3.1-flash-lite #2 | gemini-3-flash-preview #1 |
|---|---|---|---|---|---|
| furnizor | 100.0% (16/16) | 100.0% (18/18) | 100.0% (17/17) | 100.0% (20/20) | 100.0% (15/15) |
| cui | 100.0% (16/16) | 100.0% (18/18) | 100.0% (17/17) | 100.0% (20/20) | 100.0% (15/15) |
| data | 100.0% (16/16) | 100.0% (18/18) | 100.0% (17/17) | 100.0% (20/20) | 100.0% (15/15) |
| total | 100.0% (16/16) | 100.0% (18/18) | 100.0% (17/17) | 100.0% (20/20) | 100.0% (15/15) |
| linii | 100.0% (16/16) | 100.0% (18/18) | 100.0% (17/17) | 100.0% (20/20) | 100.0% (15/15) |
| produs | 100.0% (63/63) | 100.0% (70/70) | 100.0% (68/68) | 100.0% (78/78) | 100.0% (58/58) |
| cantitate | 100.0% (63/63) | 100.0% (70/70) | 100.0% (68/68) | 100.0% (78/78) | 100.0% (58/58) |
| pret | 100.0% (63/63) | 100.0% (70/70) | 100.0% (68/68) | 100.0% (78/78) | 100.0% (58/58) |

## Controale corecte pe camp, din toate facturile

O extragere esuata are toate controalele gresite, deci aici scad si extragerile esuate.

| Camp | gemini-3.5-flash-lite #1 | gemini-3.5-flash-lite #2 | gemini-3.1-flash-lite #1 | gemini-3.1-flash-lite #2 | gemini-3-flash-preview #1 |
|---|---|---|---|---|---|
| furnizor | 16/20 | 18/20 | 17/20 | 20/20 | 15/20 |
| cui | 16/20 | 18/20 | 17/20 | 20/20 | 15/20 |
| data | 16/20 | 18/20 | 17/20 | 20/20 | 15/20 |
| total | 16/20 | 18/20 | 17/20 | 20/20 | 15/20 |
| linii | 16/20 | 18/20 | 17/20 | 20/20 | 15/20 |
| produs | 63/78 | 70/78 | 68/78 | 78/78 | 58/78 |
| cantitate | 63/78 | 70/78 | 68/78 | 78/78 | 58/78 |
| pret | 63/78 | 70/78 | 68/78 | 78/78 | 58/78 |

## gemini-3.5-flash-lite

- Pret: randul `gemini-3.5-flash-lite` din src/lib/cost.ts: $0.30 / 1M tokeni intrare, $2.50 / 1M tokeni iesire
- Rulari: 2, alaturate mai jos

| Masura | Rulare 1 | Rulare 2 |
|---|---|---|
| Inceput | 2026-11-19 15:42 UTC | 2026-11-19 16:56 UTC |
| Facturi extrase | 16/20 | 18/20 |
| Extrageri esuate | 4/20 (4 x 503) | 2/20 (2 x 503) |
| Controale corecte, pe extrase | 269/269 (100.0%) | 300/300 (100.0%) |
| Controale corecte, din toate | 269/334 | 300/334 |
| Facturi complet corecte, din extrase | 16/16 | 18/18 |
| Facturi complet corecte, din toate | 16/20 | 18/20 |
| Tokeni intrare pe factura extrasa | 391 | 371 |
| Tokeni iesire pe factura extrasa | 254 | 251 |
| Cost pe factura extrasa | $0.000752 | $0.000739 |
| Tokeni intrare, total | 6262 | 6676 |
| Tokeni iesire, total | 4060 | 4517 |
| Cost total | $0.012029 | $0.013295 |
| Latenta medie | 91.9 s | 22.7 s |
| Latenta mediana | 60.0 s | 10.9 s |
| Latenta maxima | 346.6 s | 81.6 s |
| Gresite semnalate, din cele extrase | 4/4 (neextrase: 1) | 4/4 (neextrase: 1) |
| Corecte lasate ok, din cele extrase | 12/12 (neextrase: 3) | 14/14 (neextrase: 1) |
| Coduri exacte, din cele extrase | 16/16 | 18/18 |
| Gresite semnalate, din toate | 4/5 | 4/5 |
| Corecte lasate ok, din toate | 12/15 | 14/15 |

### gemini-3.5-flash-lite, rularea 1

- 10.pdf: extragere esuata: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent: [503 Service Unavailable] This model is currently experie ...
- 12.pdf: extragere esuata: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent: [503 Service Unavailable] This model is currently experie ...
- 13.pdf: extragere esuata: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent: [503 Service Unavailable] This model is currently experie ...
- 19.pdf: extragere esuata: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent: [503 Service Unavailable] This model is currently experie ...

### gemini-3.5-flash-lite, rularea 2

- 13.pdf: extragere esuata: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent: [503 Service Unavailable] This model is currently experie ...
- 16.pdf: extragere esuata: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent: [503 Service Unavailable] This model is currently experie ...

## gemini-3.1-flash-lite

- Pret: randul `gemini-3.1-flash-lite` din src/lib/cost.ts: $0.25 / 1M tokeni intrare, $1.50 / 1M tokeni iesire
- Rulari: 2, alaturate mai jos

| Masura | Rulare 1 | Rulare 2 |
|---|---|---|
| Inceput | 2026-11-19 16:10 UTC | 2026-11-19 17:06 UTC |
| Facturi extrase | 17/20 | 20/20 |
| Extrageri esuate | 3/20 (3 x 503) | 0/20 |
| Controale corecte, pe extrase | 289/289 (100.0%) | 334/334 (100.0%) |
| Controale corecte, din toate | 289/334 | 334/334 |
| Facturi complet corecte, din extrase | 17/17 | 20/20 |
| Facturi complet corecte, din toate | 17/20 | 20/20 |
| Tokeni intrare pe factura extrasa | 361 | 369 |
| Tokeni iesire pe factura extrasa | 252 | 246 |
| Cost pe factura extrasa | $0.000468 | $0.000461 |
| Tokeni intrare, total | 6134 | 7386 |
| Tokeni iesire, total | 4279 | 4920 |
| Cost total | $0.007952 | $0.009227 |
| Latenta medie | 18.4 s | 30.7 s |
| Latenta mediana | 7.2 s | 19.1 s |
| Latenta maxima | 73.9 s | 167.3 s |
| Gresite semnalate, din cele extrase | 3/3 (neextrase: 2) | 5/5 |
| Corecte lasate ok, din cele extrase | 14/14 (neextrase: 1) | 15/15 |
| Coduri exacte, din cele extrase | 17/17 | 20/20 |
| Gresite semnalate, din toate | 3/5 | 5/5 |
| Corecte lasate ok, din toate | 14/15 | 15/15 |

### gemini-3.1-flash-lite, rularea 1

- 01.pdf: extragere esuata: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent: [503 Service Unavailable] This model is currently experie ...
- 16.pdf: extragere esuata: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent: [503 Service Unavailable] This model is currently experie ...
- 18.pdf: extragere esuata: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent: [503 Service Unavailable] This model is currently experie ...

### gemini-3.1-flash-lite, rularea 2

- Toate facturile extrase, toate controalele corecte, validarea cu codurile asteptate la fiecare factura

## gemini-3-flash-preview

- Pret: randul `gemini-3-flash` din src/lib/cost.ts (cel mai lung prefix al numelui): $0.50 / 1M tokeni intrare, $3.00 / 1M tokeni iesire
- Rulari: 1; variatia de la o rulare la alta nu se vede

### gemini-3-flash-preview, rularea 1

- 04.pdf: extragere esuata: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent: [503 Service Unavailable] This model is currently experi ...
- 17.pdf: extragere esuata: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent: [429 Too Many Requests] You exceeded your current quota, ...
- 18.pdf: extragere esuata: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent: [429 Too Many Requests] You exceeded your current quota, ...
- 19.pdf: extragere esuata: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent: [429 Too Many Requests] You exceeded your current quota, ...
- 20.pdf: extragere esuata: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent: [429 Too Many Requests] You exceeded your current quota, ...
