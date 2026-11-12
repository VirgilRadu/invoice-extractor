# Eval extractor facturi

- Model: gemini-3.5-flash-lite
- Data rularii: 2026-11-12
- Facturi: 15
- Facturi complet corecte: 12 din 15
- Acuratete totala: 85.1% (217 din 255 controale)

## Acuratete pe camp

| Camp | Corecte | Total | Acuratete |
|---|---|---|---|
| furnizor | 13 | 15 | 86.7% |
| cui | 13 | 15 | 86.7% |
| data | 13 | 15 | 86.7% |
| total | 12 | 15 | 80.0% |
| linii | 13 | 15 | 86.7% |
| produs | 51 | 60 | 85.0% |
| cantitate | 51 | 60 | 85.0% |
| pret | 51 | 60 | 85.0% |

## Tokeni, cost si latenta

- Tokeni intrare: 4954
- Tokeni iesire: 3290
- Cost total: $0.009711
- Cost mediu pe factura extrasa: $0.000747 (13 extrase din 15)
- Latenta medie: 17386 ms, maxima: 86228 ms (doar extragerile reusite)
- Pret folosit pentru gemini-3.5-flash-lite: $0.30 / 1M tokeni intrare, $2.50 / 1M tokeni iesire (src/lib/cost.ts)
- Costul este calculat la pretul de lista al nivelului platit; rularea a fost facuta pe nivelul gratuit.

| Fisier | Controale corecte | Tokeni intrare | Tokeni iesire | Latenta (ms) | Cost |
|---|---|---|---|---|---|
| 01.txt | 14/14 | 434 | 208 | 5302 | $0.000650 |
| 02.txt | 20/20 | 420 | 298 | 3068 | $0.000871 |
| 03.txt | 11/11 | 424 | 168 | 1874 | $0.000547 |
| 04.txt | 23/23 | 404 | 358 | 18057 | $0.001016 |
| 05.txt | 8/8 | 221 | 117 | 1713 | $0.000359 |
| 06.txt | 29/29 | 512 | 424 | 7787 | $0.001214 |
| 07.txt | 14/14 | 402 | 206 | 1499 | $0.000636 |
| 08.txt | 17/17 | 351 | 268 | 1491 | $0.000775 |
| 09.txt | 17/17 | 475 | 275 | 4710 | $0.000830 |
| 10.txt | 14/14 | 230 | 201 | 12807 | $0.000571 |
| 11.txt | 14/14 | 320 | 213 | 13807 | $0.000628 |
| 12.txt | 0/20 | 0 | 0 | - | n/a |
| 13.txt | 17/17 | 268 | 259 | 86228 | $0.000728 |
| 14.txt | 19/20 | 493 | 295 | 67672 | $0.000885 |
| 15.txt | 0/17 | 0 | 0 | - | n/a |

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
- 12.txt: extragere esuata: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent: [503 Service Unavailable] This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
- 13.txt: toate controalele corecte
- 14.txt:
  - total: asteptat 1089.05, obtinut 1.08905
- 15.txt: extragere esuata: [GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent: [503 Service Unavailable] This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.
