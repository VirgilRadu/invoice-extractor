# Eval extractor facturi

- Model principal: gemini-3.5-flash-lite
- Model de rezerva: gemini-3.1-flash-lite
- Data rularii: 2026-11-12
- Facturi: 20
- Facturi complet corecte: 20 din 20
- Acuratete totala: 100.0% (334 din 334 controale)
- Extrageri esuate: 0 din 20 (provider picat sau raspuns respins; controalele lor sunt numarate gresite mai sus)
- Acuratete pe facturile extrase: 100.0% (334 din 334 controale, 20 facturi)

## Acuratete pe camp

| Camp | Corecte | Total | Acuratete |
|---|---|---|---|
| furnizor | 20 | 20 | 100.0% |
| cui | 20 | 20 | 100.0% |
| data | 20 | 20 | 100.0% |
| total | 20 | 20 | 100.0% |
| linii | 20 | 20 | 100.0% |
| produs | 78 | 78 | 100.0% |
| cantitate | 78 | 78 | 100.0% |
| pret | 78 | 78 | 100.0% |

## Validare

- Data de referinta: 2026-11-12, fixa pentru setul de date, ca codurile asteptate sa ramana adevarate oricand ar fi rulat eval-ul (pnpm start foloseste data curenta)
- Facturi gresite semnalate: 5 din 5
- Facturi corecte lasate ok: 15 din 15
  - din celelalte 0: 0 extrageri esuate (nevalidate), 0 semnalate
- Facturi cu exact codurile asteptate: 20 din 20
- O factura corecta semnalata are o valoare extrasa gresit, prinsa de validare. O extragere esuata nu este numarata nici semnalata, nici ok.

| Fisier | Coduri asteptate | Coduri obtinute | Rezultat |
|---|---|---|---|
| 01.txt | - | - | corecta, lasata ok |
| 02.txt | - | - | corecta, lasata ok |
| 03.txt | - | - | corecta, lasata ok |
| 04.txt | - | - | corecta, lasata ok |
| 05.txt | - | - | corecta, lasata ok |
| 06.txt | - | - | corecta, lasata ok |
| 07.txt | - | - | corecta, lasata ok |
| 08.txt | - | - | corecta, lasata ok |
| 09.txt | - | - | corecta, lasata ok |
| 10.txt | - | - | corecta, lasata ok |
| 11.txt | - | - | corecta, lasata ok |
| 12.txt | - | - | corecta, lasata ok |
| 13.txt | - | - | corecta, lasata ok |
| 14.txt | - | - | corecta, lasata ok |
| 15.txt | - | - | corecta, lasata ok |
| 16.txt | suma_diferita | suma_diferita | gresita, semnalata cu codurile asteptate |
| 17.txt | data_invalida | data_invalida | gresita, semnalata cu codurile asteptate |
| 18.txt | cui_cifra_control | cui_cifra_control | gresita, semnalata cu codurile asteptate |
| 19.txt | cui_format | cui_format | gresita, semnalata cu codurile asteptate |
| 20.txt | suma_diferita, data_in_viitor | suma_diferita, data_in_viitor | gresita, semnalata cu codurile asteptate |

## Tokeni, cost si latenta

- Tokeni intrare: 7753
- Tokeni iesire: 5009
- Cost total: $0.013689
- Cost mediu pe factura extrasa: $0.000684 (20 extrase din 20)
- Latenta medie: 11880 ms, maxima: 87778 ms (doar extragerile reusite; timpul include reincercarile si trecerea pe rezerva)
- Facturi la care a raspuns rezerva (gemini-3.1-flash-lite): 4 din 20 extrase
- Pret folosit pentru gemini-3.5-flash-lite (16 facturi, 6166 tokeni intrare / 3929 iesire): $0.30 / 1M tokeni intrare, $2.50 / 1M tokeni iesire (src/lib/cost.ts)
- Pret folosit pentru gemini-3.1-flash-lite (4 facturi, 1587 tokeni intrare / 1080 iesire): $0.25 / 1M tokeni intrare, $1.50 / 1M tokeni iesire (src/lib/cost.ts)
- Costul este calculat la pretul de lista al nivelului platit; rularea a fost facuta pe nivelul gratuit.

| Fisier | Model | Controale corecte | Tokeni intrare | Tokeni iesire | Latenta (ms) | Cost |
|---|---|---|---|---|---|---|
| 01.txt | gemini-3.5-flash-lite | 14/14 | 434 | 208 | 17721 | $0.000650 |
| 02.txt | gemini-3.5-flash-lite | 20/20 | 420 | 295 | 9908 | $0.000864 |
| 03.txt | gemini-3.5-flash-lite | 11/11 | 424 | 168 | 13394 | $0.000547 |
| 04.txt | gemini-3.5-flash-lite | 23/23 | 404 | 358 | 12610 | $0.001016 |
| 05.txt | gemini-3.1-flash-lite | 8/8 | 221 | 116 | 4258 | $0.000229 |
| 06.txt | gemini-3.1-flash-lite | 29/29 | 512 | 425 | 12588 | $0.000765 |
| 07.txt | gemini-3.5-flash-lite | 14/14 | 402 | 210 | 4989 | $0.000646 |
| 08.txt | gemini-3.5-flash-lite | 17/17 | 351 | 260 | 1467 | $0.000755 |
| 09.txt | gemini-3.5-flash-lite | 17/17 | 475 | 278 | 8954 | $0.000837 |
| 10.txt | gemini-3.5-flash-lite | 14/14 | 230 | 201 | 1085 | $0.000571 |
| 11.txt | gemini-3.5-flash-lite | 14/14 | 320 | 213 | 8423 | $0.000628 |
| 12.txt | gemini-3.5-flash-lite | 20/20 | 354 | 283 | 2145 | $0.000814 |
| 13.txt | gemini-3.5-flash-lite | 17/17 | 268 | 259 | 8363 | $0.000728 |
| 14.txt | gemini-3.1-flash-lite | 20/20 | 493 | 287 | 87778 | $0.000554 |
| 15.txt | gemini-3.5-flash-lite | 17/17 | 403 | 247 | 7362 | $0.000738 |
| 16.txt | gemini-3.5-flash-lite | 17/17 | 479 | 268 | 5478 | $0.000814 |
| 17.txt | gemini-3.1-flash-lite | 17/17 | 361 | 252 | 20199 | $0.000468 |
| 18.txt | gemini-3.5-flash-lite | 14/14 | 406 | 215 | 5454 | $0.000659 |
| 19.txt | gemini-3.5-flash-lite | 14/14 | 304 | 208 | 1959 | $0.000611 |
| 20.txt | gemini-3.5-flash-lite | 17/17 | 492 | 258 | 3473 | $0.000793 |

## Rezultat pe factura

- 01.txt: toate controalele corecte
- 02.txt: toate controalele corecte
- 03.txt: toate controalele corecte
- 04.txt: toate controalele corecte
- 05.txt: toate controalele corecte
- 06.txt: toate controalele corecte
- 07.txt: toate controalele corecte
- 08.txt: toate controalele corecte
- 09.txt: toate controalele corecte
- 10.txt: toate controalele corecte
- 11.txt: toate controalele corecte
- 12.txt: toate controalele corecte
- 13.txt: toate controalele corecte
- 14.txt: toate controalele corecte
- 15.txt: toate controalele corecte
- 16.txt: toate controalele corecte
- 17.txt: toate controalele corecte
- 18.txt: toate controalele corecte
- 19.txt: toate controalele corecte
- 20.txt: toate controalele corecte
