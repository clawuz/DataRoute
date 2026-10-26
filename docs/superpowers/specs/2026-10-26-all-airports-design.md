# All airports: 13 more cards and a style for every country and big city

Date: 2026-10-26. Branch: `feat/ui-v2`. Continues `2026-10-26-destination-styles-design.md` (38 cards, airport groups for Turkey, the US, Spain, Greece, Italy, Germany, the UK).

## Why

After the destination styles, 224 of the 351 airports still have a one-card list and many big countries share one card for all cities (Russia 15 airports, India 6, China 8, the Gulf, the Maghreb, France, Brazil, Nigeria …). The user: "a plan for all the airports".

## The 13 new cards (hand-set judgements, to be tuned by ear; instruments of the pack stand in where the real one is missing)

| id | name | family | bpm | scale / wish | cell, accent | voices |
|---|---|---|---|---|---|---|
| `samba` | Brazilian samba | pulse | 96–112 | MAJOR / MIXO | [3,3,2,3,3,2], [1.2,0.9,1,1.1,0.9,1] | melody NYLONGUITAR, FLUTE, ACCORDION; pluck NYLONGUITAR, PSALTERY (cavaquinho); held ACCORDION, CELLO; bass UPRIGHTBASS; perc TAMB; prog [[0,4],[5,4],[7,4],[0,4]] |
| `afrobeat` | Afrobeat & highlife | pulse | 100–118 | DORIAN / MIXO | [3,1,2,3,1,2], [1.25,0.9,1,1.15,0.9,1] | melody TENORSAX, GUITAR_EL, EKEYS; pluck GUITAR_EL, KALIMBA; held EKEYS, BSN; bass BASS_EL; perc CONGA; prog [[0,3],[5,4],[0,3],[7,4]] |
| `bollywood` | Bollywood film song | pulse | 96–116 | HARMONIC / MAJOR | [2,1,1,1,1,2], [1.2,0.85,0.9,0.85,0.9,1.05] | melody VIOLIN, SANTUR, FLUTE; pluck SANTUR, GUITAR_AC; held VIOLA, CELLO, ACCORDION; perc TABLA; prog [[0,3],[8,4],[3,4],[10,4]] |
| `khaleeji` | Gulf khaleeji | folk | 92–108 | HICAZ / RAST | [2,2,1,1,2], [1.25,0.9,0.85,0.9,1.1] | melody NEY_MAKAM, KANUN, DUDUK; pluck KANUN, SANTUR; held CELLO, VIOLA; perc DARBUKA; prog [[0,4],[1,4],[0,4],[7,4]] |
| `maghrebi` | Maghreb chaabi & raï | folk | 100–118 | HICAZ / DORIAN | [3,2,3], [1.25,0.9,1.1] | melody NEY_MAKAM, ACCORDION, VIOLIN; pluck NYLONGUITAR, SANTUR; held CELLO, ACCORDION; perc DARBUKA; prog [[0,3],[10,4],[0,3],[7,4]] |
| `russian` | Russian romance & waltz | symphonic | 84–108 | MINOR / MAJOR | [1,1,1], [1.2,0.9,0.9] | melody VIOLIN, ACCORDION, CLA; pluck PSALTERY (balalaika), HARP; held CELLO, HORN, BSN; perc TIMP; prog [[0,3],[8,4],[3,4],[7,4]] |
| `thai` | Thai ranat | chamber | 88–108 | LYDIAN / MAJOR_PENT | [2,2,1,1,2], [1.2,0.9,0.85,0.9,1.05] | melody VIBES, STEELDRUM, FLUTE; pluck VIBES, KALIMBA; held GONG, CELLO; perc TRI; prog [[0,4],[5,4],[0,4],[7,4]] |
| `chinese` | Chinese pentatonic | chamber | 76–96 | MAJOR_PENT / MAJOR_PENT | [2,1,1,2], [1.2,0.9,0.9,1] | melody ERHU, KOTO, FLUTE; pluck KOTO, KAYAGEUM, DANTRANH; held CELLO, VIOLA; perc GONG; prog [[0,4],[7,4],[9,3],[5,4]] |
| `cumbia` | Cumbia | pulse | 92–108 | MINOR_PENT / MAJOR_PENT | [3,1,2,2], [1.25,0.85,1.05,1] | melody ACCORDION, FLUTE, GUITAR_AC; pluck NYLONGUITAR, KALIMBA; held ACCORDION, CELLO; bass UPRIGHTBASS; perc CONGA; prog [[0,3],[5,4],[7,4],[0,3]] |
| `andean` | Andean | folk | 84–104 | MINOR_PENT / MAJOR_PENT | [1,1,2], [1.2,0.9,1] | melody PANPIPE, FLUTE, NYLONGUITAR; pluck NYLONGUITAR (charango), KALIMBA; held PANPIPE, CELLO; perc FRAMEDRUM (bombo); prog [[0,3],[8,4],[3,4],[10,4]] |
| `caucasus` | Caucasus (duduk) | folk | 88–108 | HARMONIC / MIXO | [2,1,2,1,2], [1.25,0.85,1,0.85,1.05] | melody DUDUK, BAGPIPE, ACCORDION; pluck PSALTERY, SAZ; held DUDUK, BAGPIPE_DRONE; perc BENDIR; prog [[0,3],[10,4],[8,4],[7,4]] |
| `fado` | Fado | chamber | 76–92 | MINOR / MAJOR | [1,1,1,1], [1.15,0.9,1,0.9] | melody NYLONGUITAR, PSALTERY (guitarra), ACCORDION; pluck PSALTERY, NYLONGUITAR; held CELLO, VIOLA; perc TRI; prog [[0,3],[10,4],[8,4],[7,4]] |
| `chanson` | French chanson & musette | chamber | 92–112 | MAJOR / LYDIAN | [1,1,1], [1.2,0.9,0.9] | melody ACCORDION, VIOLIN, CLA; pluck GUITAR_AC, HARP; held ACCORDION, CELLO; bass UPRIGHTBASS; perc TAMB; prog [[0,4],[9,3],[5,4],[7,4]] |

Idioms (`IDIOMS`): samba `{ step: 0.6, repeat: 0.25, leaps: [2, 3], bias: 0, span: 6, arc: 2, start: [0, 2, 4] }`; afrobeat `{ step: 0.55, repeat: 0.3, leaps: [2, 3], bias: 0, span: 5, arc: 2, start: [0, 2, 4] }`; bollywood `{ step: 0.65, repeat: 0.15, leaps: [2, 3], bias: -1, span: 7, arc: 3, start: [4, 2, 3] }`; khaleeji `{ step: 0.75, repeat: 0.25, leaps: [2], bias: -1, span: 5, arc: 2, start: [3, 4, 2] }`; maghrebi `{ step: 0.7, repeat: 0.25, leaps: [2, 3], bias: -1, span: 5, arc: 2, start: [3, 4, 2] }`; russian `{ step: 0.7, repeat: 0.1, leaps: [2, 3], bias: -1, span: 7, arc: 3, start: [4, 2, 0] }`; thai `{ step: 0.6, repeat: 0.2, leaps: [2, 3], bias: 0, span: 6, arc: 2 }`; chinese `{ step: 0.55, repeat: 0.1, leaps: [2, 3], bias: 0, span: 5, arc: 2, start: [0, 2, 4] }`; cumbia `{ step: 0.65, repeat: 0.3, leaps: [2], bias: 0, span: 5, arc: 2, start: [0, 2, 4] }`; andean `{ step: 0.7, repeat: 0.25, leaps: [2, 3], bias: -1, span: 5, arc: 2, start: [4, 2, 0] }`; caucasus `{ step: 0.75, repeat: 0.2, leaps: [2], bias: -1, span: 5, arc: 2, start: [3, 4, 2] }`; fado `{ step: 0.75, repeat: 0.1, leaps: [2, 3], bias: -1, span: 6, arc: 2, start: [4, 2, 0] }`; chanson `{ step: 0.7, repeat: 0.1, leaps: [2, 4], bias: 0, span: 6, arc: 2 }`. Drone: `caucasus: "BAGPIPE_DRONE"`.

## Where every card plays (airport groups and country lists; the first card of a list is the most likely, the hash of the route picks among the cards)

Replace/extend `BY_AIRPORT` (airport first) and `BY_ISO` (country). Unlisted airports keep their list.

- **Brazil**: GRU VCP → `samba`, `bossa`, `funk`. **Nigeria**: LOS PHC → `afrobeat`, `westafrica`; ABV KAN → `westafrica`, `afrobeat`. **Ghana**: `westafrica`, `afrobeat`.
- **India**: BOM NMI BLR HYD MAA → `bollywood`, `hindustani`; DEL → `hindustani`, `bollywood`. **Pakistan**: `hindustani`, `bollywood`.
- **Gulf** (SA AE QA KW BH OM): `khaleeji`, `arabic`. Egypt, Jordan, Lebanon, Syria, Iraq, Yemen, Sudan: `arabic` (unchanged). **Maghreb** (MA DZ TN LY): `maghrebi`, `arabic` (MA also `flamenco`).
- **Russia** (all 15): `russian`, `slavic`. Belarus, Ukraine: `slavic`, `russian`.
- **Thailand**: `thai`, `gamelan`. **China** (PEK PVG CAN SZX TFU XIY CGO): `chinese`, `eastasia`; URC: `chinese`, `centralasia`. **Hong Kong, Taiwan, Macau**: `chinese`, `pop`. **Singapore**: `chinese`, `gamelan`, `pop`. Japan, Korea, Vietnam: unchanged.
- **Colombia** BOG: `cumbia`, `salsa`; **Venezuela** CCS, **Panama** PTY: `salsa`, `cumbia`; **Ecuador** UIO: `andean`, `cumbia`; **Chile** SCL: `andean`, `tango`.
- **Georgia** (TBS BUS): `caucasus`, `slavic`; **Armenia** EVN: `caucasus`, `anatolian`; **Azerbaijan**: `caucasus`, `centralasia`, `anatolian`.
- **Portugal**: `fado`, `bossa`. **France**: CDG LYS BOD TLS BSL → `chanson`, `romantic`, `jazz`; MRS NCE → `jazz`, `chanson`, `romantic`.
- Every card (51) is reachable from at least one airport (the existing reachability test).

## Testing

New-card validity test extended to the 13 (the same checks as `personal-cards-new.test.ts`, `CARDS.length` 51); airport tests for the lists above (one test per group, first card + membership); the variety test stays; goldens re-captured where the mapping changes (reason in the comment).
