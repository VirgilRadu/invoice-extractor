# Eval extractor facturi

- Model principal: gemini-3.5-flash-lite
- Model de rezerva: gemini-3.1-flash-lite
- Data rularii: 2026-11-19
- Intrare: date/pdf (PDF, textul paginilor citit cu pdfjs-dist)
- Facturi: 20
- Facturi complet corecte: 19 din 20
- Acuratete totala: 99.7% (333 din 334 controale)
- Extrageri esuate: 0 din 20 (provider picat sau raspuns respins; controalele lor sunt numarate gresite mai sus)
- Acuratete pe facturile extrase: 99.7% (333 din 334 controale, 20 facturi)

## Acuratete pe camp

| Camp | Corecte | Total | Acuratete |
|---|---|---|---|
| furnizor | 20 | 20 | 100.0% |
| cui | 20 | 20 | 100.0% |
| data | 19 | 20 | 95.0% |
| total | 20 | 20 | 100.0% |
| linii | 20 | 20 | 100.0% |
| produs | 78 | 78 | 100.0% |
| cantitate | 78 | 78 | 100.0% |
| pret | 78 | 78 | 100.0% |

## Validare

- Data de referinta: 2026-11-12, fixa pentru setul de date, ca codurile asteptate sa ramana adevarate oricand ar fi rulat eval-ul (pnpm start foloseste data curenta)
- Facturi gresite semnalate: 4 din 5
- Facturi corecte lasate ok: 15 din 15
  - din celelalte 0: 0 extrageri esuate (nevalidate), 0 semnalate
- Facturi cu exact codurile asteptate: 19 din 20
- O factura corecta semnalata are o valoare extrasa gresit, prinsa de validare. O extragere esuata nu este numarata nici semnalata, nici ok.

| Fisier | Coduri asteptate | Coduri obtinute | Rezultat |
|---|---|---|---|
| 01.pdf | - | - | corecta, lasata ok |
| 02.pdf | - | - | corecta, lasata ok |
| 03.pdf | - | - | corecta, lasata ok |
| 04.pdf | - | - | corecta, lasata ok |
| 05.pdf | - | - | corecta, lasata ok |
| 06.pdf | - | - | corecta, lasata ok |
| 07.pdf | - | - | corecta, lasata ok |
| 08.pdf | - | - | corecta, lasata ok |
| 09.pdf | - | - | corecta, lasata ok |
| 10.pdf | - | - | corecta, lasata ok |
| 11.pdf | - | - | corecta, lasata ok |
| 12.pdf | - | - | corecta, lasata ok |
| 13.pdf | - | - | corecta, lasata ok |
| 14.pdf | - | - | corecta, lasata ok |
| 15.pdf | - | - | corecta, lasata ok |
| 16.pdf | suma_diferita | suma_diferita | gresita, semnalata cu codurile asteptate |
| 17.pdf | data_invalida | - | gresita, nesemnalata |
| 18.pdf | cui_cifra_control | cui_cifra_control | gresita, semnalata cu codurile asteptate |
| 19.pdf | cui_format | cui_format | gresita, semnalata cu codurile asteptate |
| 20.pdf | suma_diferita, data_in_viitor | suma_diferita, data_in_viitor | gresita, semnalata cu codurile asteptate |

## Tokeni, cost si latenta

- Tokeni intrare: 7386
- Tokeni iesire: 5010
- Cost total: $0.014741
- Cost mediu pe factura extrasa: $0.000737 (20 extrase din 20)
- Latenta medie: 21671 ms, maxima: 295956 ms (doar extragerile reusite; timpul include reincercarile si trecerea pe rezerva)
- Facturi la care a raspuns rezerva (gemini-3.1-flash-lite): 0 din 20 extrase
- Pret folosit pentru gemini-3.5-flash-lite (20 facturi, 7386 tokeni intrare / 5010 iesire): $0.30 / 1M tokeni intrare, $2.50 / 1M tokeni iesire (src/lib/cost.ts)
- Costul este calculat la pretul de lista al nivelului platit; rularea a fost facuta pe nivelul gratuit.

| Fisier | Model | Controale corecte | Tokeni intrare | Tokeni iesire | Latenta (ms) | Cost |
|---|---|---|---|---|---|---|
| 01.pdf | gemini-3.5-flash-lite | 14/14 | 408 | 208 | 7488 | $0.000642 |
| 02.pdf | gemini-3.5-flash-lite | 20/20 | 412 | 295 | 8047 | $0.000861 |
| 03.pdf | gemini-3.5-flash-lite | 11/11 | 398 | 168 | 7787 | $0.000539 |
| 04.pdf | gemini-3.5-flash-lite | 23/23 | 384 | 358 | 7478 | $0.001010 |
| 05.pdf | gemini-3.5-flash-lite | 8/8 | 209 | 117 | 6835 | $0.000355 |
| 06.pdf | gemini-3.5-flash-lite | 29/29 | 472 | 429 | 2150 | $0.001214 |
| 07.pdf | gemini-3.5-flash-lite | 14/14 | 386 | 206 | 3811 | $0.000631 |
| 08.pdf | gemini-3.5-flash-lite | 17/17 | 345 | 265 | 7280 | $0.000766 |
| 09.pdf | gemini-3.5-flash-lite | 17/17 | 447 | 275 | 8636 | $0.000822 |
| 10.pdf | gemini-3.5-flash-lite | 14/14 | 227 | 205 | 7901 | $0.000581 |
| 11.pdf | gemini-3.5-flash-lite | 14/14 | 309 | 213 | 7621 | $0.000625 |
| 12.pdf | gemini-3.5-flash-lite | 20/20 | 333 | 289 | 7962 | $0.000822 |
| 13.pdf | gemini-3.5-flash-lite | 17/17 | 263 | 259 | 9946 | $0.000726 |
| 14.pdf | gemini-3.5-flash-lite | 20/20 | 450 | 290 | 7553 | $0.000860 |
| 15.pdf | gemini-3.5-flash-lite | 17/17 | 395 | 247 | 7403 | $0.000736 |
| 16.pdf | gemini-3.5-flash-lite | 17/17 | 447 | 260 | 7778 | $0.000784 |
| 17.pdf | gemini-3.5-flash-lite | 16/17 | 350 | 249 | 9217 | $0.000727 |
| 18.pdf | gemini-3.5-flash-lite | 14/14 | 397 | 214 | 4144 | $0.000654 |
| 19.pdf | gemini-3.5-flash-lite | 14/14 | 301 | 210 | 8418 | $0.000615 |
| 20.pdf | gemini-3.5-flash-lite | 17/17 | 453 | 253 | 295956 | $0.000768 |

## Rezultat pe factura

- 01.pdf: toate controalele corecte
- 02.pdf: toate controalele corecte
- 03.pdf: toate controalele corecte
- 04.pdf: toate controalele corecte
- 05.pdf: toate controalele corecte
- 06.pdf: toate controalele corecte
- 07.pdf: toate controalele corecte
- 08.pdf: toate controalele corecte
- 09.pdf: toate controalele corecte
- 10.pdf: toate controalele corecte
- 11.pdf: toate controalele corecte
- 12.pdf: toate controalele corecte
- 13.pdf: toate controalele corecte
- 14.pdf: toate controalele corecte
- 15.pdf: toate controalele corecte
- 16.pdf: toate controalele corecte
- 17.pdf:
  - data: asteptat "2026-02-31", obtinut "2026-02-28"
- 18.pdf: toate controalele corecte
- 19.pdf: toate controalele corecte
- 20.pdf: toate controalele corecte
