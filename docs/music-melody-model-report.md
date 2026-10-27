# The melody model report

Spec: `docs/superpowers/specs/2026-10-27-melody-trained-design.md`. Sections are rewritten by the scripts that own them.

## Corpus

Built by `scripts/music/melody/build_corpus.py` (ingestors in `scripts/music/melody/corpus/`, mapping tables `makam-cards.json` and `cards-map.json`) into `.corpora/phrases/<card>.jsonl` (git-excluded; never committed). A phrase = 4 consecutive bars aligned to bar starts (stride 2), kept when it has >= 3 notes per bar on average, <= 40% rest time and <= 25% of its notes outside [-2, 9] (those are clipped); degrees are indices into the target card's scale (0 = tonic / karar). Identical phrases of one piece on one card are written once. Deterministic (sorted inputs, the archive's member order, a stable SHA-1 order for the PDMX cap of 600 pieces per card).

### Licence ledger

| source | licence | shippable | phrases (all cards) | pieces used (card x piece) |
|---|---|---|---|---|
| symbtr | CC BY-NC-SA 4.0 | no (local listening only) | 114300 | 6685 |
| pdmx | CC BY 4.0 dataset; public-domain / CC0 scores | yes | 109483 | 8516 |
| nottingham | GPL-3.0 repo; traditional tunes, open-access data | yes | 9420 | 1723 |

### Phrases per card by source

| card | symbtr | pdmx | nottingham | total | shippable total | pieces (s / p / n) | used as |
|---|---|---|---|---|---|---|---|
| afrobeat | 0 | 17 | 0 | 17 | 17 | 0 / 3 / 0 | grammar |
| akdeniz | 5909 | 0 | 0 | 5909 | 0 | 344 / 0 / 0 | trained (local, SymbTr) / grammar (shippable) |
| anatolian | 13566 | 174 | 0 | 13740 | 174 | 863 / 12 / 0 | trained (local, SymbTr) / grammar (shippable) |
| andean | 0 | 381 | 0 | 381 | 381 | 0 / 25 / 0 | trained |
| arabic | 5831 | 147 | 0 | 5978 | 147 | 335 / 12 / 0 | trained (local, SymbTr) / grammar (shippable) |
| baroque | 0 | 13975 | 0 | 13975 | 13975 | 0 / 567 / 0 | trained |
| bollywood | 0 | 121 | 0 | 121 | 121 | 0 / 9 / 0 | grammar |
| bossa | 0 | 532 | 0 | 532 | 532 | 0 / 41 / 0 | trained |
| calm | 0 | 2696 | 0 | 2696 | 2696 | 0 / 234 / 0 | trained |
| caucasus | 0 | 255 | 0 | 255 | 255 | 0 / 19 / 0 | trained |
| celtic | 0 | 3349 | 5493 | 8842 | 8842 | 0 / 433 / 991 | trained |
| centralasia | 0 | 59 | 0 | 59 | 59 | 0 / 3 / 0 | grammar |
| chanson | 0 | 3701 | 0 | 3701 | 3701 | 0 / 323 / 0 | trained |
| chinese | 0 | 285 | 0 | 285 | 285 | 0 / 19 / 0 | trained |
| cinematic | 0 | 5367 | 0 | 5367 | 5367 | 0 / 533 / 0 | trained |
| classical | 0 | 10001 | 0 | 10001 | 10001 | 0 / 557 / 0 | trained |
| country | 0 | 4215 | 3632 | 7847 | 7847 | 0 / 508 / 678 | trained |
| cumbia | 0 | 126 | 0 | 126 | 126 | 0 / 11 / 0 | grammar |
| dance | 0 | 5609 | 0 | 5609 | 5609 | 0 / 364 / 0 | trained |
| dogu | 6564 | 0 | 0 | 6564 | 0 | 388 / 0 / 0 | trained (local, SymbTr) / grammar (shippable) |
| eastafrica | 0 | 118 | 0 | 118 | 118 | 0 / 9 / 0 | grammar |
| eastasia | 0 | 674 | 0 | 674 | 674 | 0 / 52 / 0 | trained |
| epic | 0 | 4773 | 0 | 4773 | 4773 | 0 / 445 / 0 | trained |
| fado | 0 | 355 | 0 | 355 | 355 | 0 / 31 / 0 | trained |
| flamenco | 0 | 146 | 0 | 146 | 146 | 0 / 13 / 0 | grammar |
| funk | 0 | 3866 | 0 | 3866 | 3866 | 0 / 320 / 0 | trained |
| gamelan | 0 | 20 | 0 | 20 | 20 | 0 / 1 / 0 | grammar |
| greek | 5932 | 197 | 0 | 6129 | 197 | 340 / 17 / 0 | trained (local, SymbTr) / grammar (shippable) |
| hindustani | 0 | 14 | 0 | 14 | 14 | 0 / 2 / 0 | grammar |
| icanadolu | 9221 | 0 | 0 | 9221 | 0 | 538 / 0 / 0 | trained (local, SymbTr) / grammar (shippable) |
| italian | 0 | 7129 | 0 | 7129 | 7129 | 0 / 456 / 0 | trained |
| jazz | 0 | 5788 | 0 | 5788 | 5788 | 0 / 518 / 0 | trained |
| karadeniz | 8592 | 8 | 0 | 8600 | 8 | 508 / 1 / 0 | trained (local, SymbTr) / grammar (shippable) |
| karsilama | 6470 | 0 | 0 | 6470 | 0 | 371 / 0 / 0 | trained (local, SymbTr) / grammar (shippable) |
| khaleeji | 5831 | 21 | 0 | 5852 | 21 | 335 / 2 / 0 | trained (local, SymbTr) / grammar (shippable) |
| maghrebi | 5831 | 14 | 0 | 5845 | 14 | 335 / 2 / 0 | trained (local, SymbTr) / grammar (shippable) |
| mariachi | 0 | 350 | 0 | 350 | 350 | 0 / 45 / 0 | trained |
| mevlevi | 17332 | 0 | 0 | 17332 | 0 | 978 / 0 / 0 | trained (local, SymbTr) / grammar (shippable) |
| nordic | 0 | 1555 | 295 | 1850 | 1850 | 0 / 150 / 54 | trained |
| persian | 14560 | 85 | 0 | 14645 | 85 | 839 / 4 / 0 | trained (local, SymbTr) / grammar (shippable) |
| pop | 0 | 8428 | 0 | 8428 | 8428 | 0 / 553 / 0 | trained |
| rnb | 0 | 4588 | 0 | 4588 | 4588 | 0 / 538 / 0 | trained |
| romantic | 0 | 7485 | 0 | 7485 | 7485 | 0 / 547 / 0 | trained |
| russian | 0 | 3469 | 0 | 3469 | 3469 | 0 / 267 / 0 | trained |
| salsa | 0 | 291 | 0 | 291 | 291 | 0 / 33 / 0 | trained |
| samba | 0 | 846 | 0 | 846 | 846 | 0 / 64 / 0 | trained |
| slavic | 0 | 4096 | 0 | 4096 | 4096 | 0 / 473 / 0 | trained |
| spguitar | 0 | 3095 | 0 | 3095 | 3095 | 0 / 215 / 0 | trained |
| tango | 0 | 928 | 0 | 928 | 928 | 0 / 69 / 0 | trained |
| thai | 0 | 48 | 0 | 48 | 48 | 0 / 5 / 0 | grammar |
| westafrica | 0 | 86 | 0 | 86 | 86 | 0 / 11 / 0 | grammar |
| zeybek | 8661 | 0 | 0 | 8661 | 0 | 511 / 0 / 0 | trained (local, SymbTr) / grammar (shippable) |

### Cards with fewer than 200 phrases -> grammar fallback

| card | all sources | shippable sources (PDMX + Nottingham) | fallback |
|---|---|---|---|
| afrobeat | 17 | 17 | both banks |
| akdeniz | 5909 | 0 | shippable bank only (the local bank trains on SymbTr) |
| anatolian | 13740 | 174 | shippable bank only (the local bank trains on SymbTr) |
| arabic | 5978 | 147 | shippable bank only (the local bank trains on SymbTr) |
| bollywood | 121 | 121 | both banks |
| centralasia | 59 | 59 | both banks |
| cumbia | 126 | 126 | both banks |
| dogu | 6564 | 0 | shippable bank only (the local bank trains on SymbTr) |
| eastafrica | 118 | 118 | both banks |
| flamenco | 146 | 146 | both banks |
| gamelan | 20 | 20 | both banks |
| greek | 6129 | 197 | shippable bank only (the local bank trains on SymbTr) |
| hindustani | 14 | 14 | both banks |
| icanadolu | 9221 | 0 | shippable bank only (the local bank trains on SymbTr) |
| karadeniz | 8600 | 8 | shippable bank only (the local bank trains on SymbTr) |
| karsilama | 6470 | 0 | shippable bank only (the local bank trains on SymbTr) |
| khaleeji | 5852 | 21 | shippable bank only (the local bank trains on SymbTr) |
| maghrebi | 5845 | 14 | shippable bank only (the local bank trains on SymbTr) |
| mevlevi | 17332 | 0 | shippable bank only (the local bank trains on SymbTr) |
| persian | 14645 | 85 | shippable bank only (the local bank trains on SymbTr) |
| thai | 48 | 48 | both banks |
| westafrica | 86 | 86 | both banks |
| zeybek | 8661 | 0 | shippable bank only (the local bank trains on SymbTr) |

### How the phrases came to each card

SymbTr `via`: region = a folk piece whose place (the composer field of a türkü) names the card; form = the form decides (zeybek, karşılama, ilahi / peşrev -> mevlevi...); makam = the makam family. PDMX `via`: tier0 = a specific match (composer, dance, national tag), tier1 = a broad genre fallback. Nottingham `via` = the book.

| card | phrases by source / via |
|---|---|
| afrobeat | pdmx/tier0 17 |
| akdeniz | symbtr/makam 5831, symbtr/region 78 |
| anatolian | pdmx/tier0 174, symbtr/form 4326, symbtr/makam 9240 |
| andean | pdmx/tier0 381 |
| arabic | pdmx/tier0 147, symbtr/makam 5831 |
| baroque | pdmx/tier0 13975 |
| bollywood | pdmx/tier0 121 |
| bossa | pdmx/tier0 532 |
| calm | pdmx/tier0 2696 |
| caucasus | pdmx/tier0 255 |
| celtic | nottingham/ashover 256, nottingham/hpps 260, nottingham/jigs 2188, nottingham/reelsa-c 450, nottingham/reelsd-g 513, nottingham/reelsh-l 538, nottingham/reelsm-q 502, nottingham/reelsr-t 486, nottingham/reelsu-z 251, nottingham/slip 49, pdmx/tier0 3349 |
| centralasia | pdmx/tier0 59 |
| chanson | pdmx/tier0 668, pdmx/tier1 3033 |
| chinese | pdmx/tier0 285 |
| cinematic | pdmx/tier0 5367 |
| classical | pdmx/tier0 10001 |
| country | nottingham/ashover 256, nottingham/hpps 260, nottingham/morris 150, nottingham/reelsa-c 450, nottingham/reelsd-g 513, nottingham/reelsh-l 538, nottingham/reelsm-q 502, nottingham/reelsr-t 486, nottingham/reelsu-z 251, nottingham/waltzes 226, pdmx/tier0 1687, pdmx/tier1 2528 |
| cumbia | pdmx/tier0 126 |
| dance | pdmx/tier0 5609 |
| dogu | symbtr/makam 5831, symbtr/region 733 |
| eastafrica | pdmx/tier0 118 |
| eastasia | pdmx/tier0 674 |
| epic | pdmx/tier0 3284, pdmx/tier1 1489 |
| fado | pdmx/tier0 355 |
| flamenco | pdmx/tier0 146 |
| funk | pdmx/tier0 604, pdmx/tier1 3262 |
| gamelan | pdmx/tier0 20 |
| greek | pdmx/tier0 197, symbtr/form 156, symbtr/makam 5776 |
| hindustani | pdmx/tier0 14 |
| icanadolu | symbtr/makam 8377, symbtr/region 844 |
| italian | pdmx/tier0 7129 |
| jazz | pdmx/tier0 5788 |
| karadeniz | pdmx/tier0 8, symbtr/makam 8377, symbtr/region 215 |
| karsilama | symbtr/form 520, symbtr/makam 5654, symbtr/region 296 |
| khaleeji | pdmx/tier0 21, symbtr/makam 5831 |
| maghrebi | pdmx/tier0 14, symbtr/makam 5831 |
| mariachi | pdmx/tier0 350 |
| mevlevi | symbtr/form 4476, symbtr/makam 12856 |
| nordic | nottingham/playford 69, nottingham/waltzes 226, pdmx/tier0 1555 |
| persian | pdmx/tier0 85, symbtr/makam 14560 |
| pop | pdmx/tier0 8428 |
| rnb | pdmx/tier0 4588 |
| romantic | pdmx/tier0 7485 |
| russian | pdmx/tier0 3469 |
| salsa | pdmx/tier0 291 |
| samba | pdmx/tier0 846 |
| slavic | pdmx/tier0 4096 |
| spguitar | pdmx/tier0 3095 |
| tango | pdmx/tier0 928 |
| thai | pdmx/tier0 48 |
| westafrica | pdmx/tier0 86 |
| zeybek | symbtr/form 146, symbtr/makam 8353, symbtr/region 162 |

### PDMX: genres / tags -> cards

Rows of `subset:no_license_conflict` with licence `publicdomain` or `cc-zero` only. Rules from `cards-map.json` (pieces selected per card: tier 0 / tier 1):

| card | rule (what matched) | selected pieces tier 0 / tier 1 |
|---|---|---|
| afrobeat | t0: tags: afrobeat, highlife, afrobeats; words: afrobeat, highlife, fela | 3 / 0 |
| akdeniz | t0: words: akdeniz | 0 / 0 |
| anatolian | t0: tags: turkish, turkey, turku, ottoman, anatolian; words: turku\b, uskudar, katibim, anatolia, ottoman, hijaz, turkish folk, sari gelin | 12 / 0 |
| andean | t0: tags: andean, peru, bolivia, peruvian, bolivian, ecuador; words: andean, andes, condor pasa, huayno, charango, quechua, peru, bolivia | 27 / 0 |
| arabic | t0: tags: arabic, arab, maqam, oud, middleeastern, egyptian, bellydance; words: habibi, maqam, danse orientale, belly dance, raqs, lebanese | 14 / 0 |
| baroque | t0: tags: baroque, bwv, harpsichord, fugue; composers: bach, handel, haendel, vivaldi, telemann, corelli, scarlatti, purcell ...; words: bwv, baroque, fugue, gavotte, bourree, sarabande, gigue | 600 / 0 |
| bollywood | t0: tags: bollywood, hindi, indian, india, tamil, punjabi; words: bollywood, hindi, tamil, punjabi, bhangra | 11 / 0 |
| bossa | t0: tags: bossanova, bossa, brazilian; composers: jobim, bonfa, gilberto, menescal, marcos valle; words: bossa, ipanema, garota, corcovado, desafinado, dindi, aguas de marco, so danco samba ... | 57 / 0 |
| calm | t0: genres: newage; tags: newage, ambient, calm, relaxing, meditation, lullaby, peaceful, chill; composers: einaudi, yiruma, satie, tiersen; words: lullaby, berceuse, reverie, gymnop, peaceful, ambient, river flows | 272 / 0 |
| caucasus | t0: tags: armenian, georgian, azerbaijani, caucasus, duduk; composers: komitas, khachaturian, hajibeyov, hacibeyov; words: armenia, azerbaij, lezginka, sabre dance, suliko, duduk, caucas, kartuli | 22 / 0 |
| celtic | t0: tags: irish, celtic, scottish, jig, reel, hornpipe, strathspey, gaelic ...; composers: carolan, o'carolan, scott skinner; words: jigs?\b, reels?\b, hornpipe, strathspey, irish, scottish, celtic, slip jig ... | 600 / 0 |
| centralasia | t0: tags: kazakh, uzbek, kyrgyz, mongolian, tuvan, centralasian; words: kazakh, uzbek, kyrgyz, mongolia, tuva, central asia | 4 / 0 |
| chanson | t0: tags: chanson, musette; composers: piaf, trenet, aznavour, brel, kosma, gainsbourg, brassens, bécaud ...; words: chanson, musette, la vie en rose, frere jacques, au clair de la lune, sous le ciel de paris, milord, padam ... / t1: tags: french, france; composers: offenbach, satie, gounod, massenet, bizet, hahn, delibes, chabrier; words: valse\b | 92 / 286 |
| chinese | t0: tags: chinese, china, erhu, guzheng, cpop; words: erhu, guzheng, jasmine flower, mo li hua, chinese folk, chinese traditional | 20 / 0 |
| cinematic | t0: tags: soundtrack, ost, film, movie, cinematic, filmmusic, orchestral; composers: zimmer, john williams, howard shore, morricone, hisaishi, horner, elfman, silvestri ...; words: cinematic, theme from, main theme, soundtrack, ost\b / t1: genres: soundtrack | 600 / 0 |
| classical | t0: tags: sonatina, minuet, classicalperiod; composers: mozart, haydn, beethoven, clementi, kuhlau, diabelli, boccherini, hummel ...; words: sonatina, minuet, menuett / t1: genres: classical | 600 / 0 |
| country | t0: genres: country; tags: country, bluegrass, americana, oldtime, folkamerican, appalachian, cowboy; words: bluegrass, hoedown, appalachian, cowboy, old time, breakdown, turkey in the straw, cotton eye / t1: genres: folk; tags: fiddle; words: reels?\b, hornpipe | 183 / 417 |
| cumbia | t0: tags: cumbia, vallenato, colombia, colombian; words: cumbia, vallenato, colombia | 12 / 0 |
| dance | t0: genres: electronic, disco; tags: edm, electronic, disco, dance, house, techno, trance, eurobeat ... | 417 / 0 |
| dogu | t0: words: halay, davul zurna | 0 / 0 |
| eastafrica | t0: tags: kenya, tanzania, zulu, southafrica, southafrican, swahili, mbira, kalimba; words: kenya\b, tanzania, zulu, south africa, swahili, mbira, kalimba, jambo\b ... | 10 / 0 |
| eastasia | t0: tags: japanese, japan, koto, shakuhachi, korean, korea, traditionaljapanese; words: koto\b, shakuhachi, sakura, arirang, enka, japanese folk, japanese traditional, korean folk | 57 / 0 |
| epic | t0: tags: epic, battle, boss, action, trailer, heroic, bossbattle; words: epic, battle, boss\b, heroic, megalovania / t1: genres: metal | 404 / 106 |
| fado | t0: tags: fado, portuguese, portugal; composers: amalia, rodrigues; words: fado | 33 / 0 |
| flamenco | t0: tags: flamenco; words: flamenco, bulerias, sevillanas, soleares, farruca, alegrias, malaguena, soleá ... | 17 / 0 |
| funk | t0: tags: funk, funky, disco; words: funk / t1: genres: rbfunksoul, disco | 96 / 275 |
| gamelan | t0: tags: gamelan, javanese, balinese; words: gamelan, javanese, balinese, pelog, slendro | 1 / 0 |
| greek | t0: tags: greek, greece, rebetiko, sirtaki; words: greek dance, greek folk, syrtos, sirtaki, rebetiko, hasapiko, zorba, kalamatian ... | 19 / 0 |
| hindustani | t0: tags: raga, hindustani, carnatic, sitar, indianclassical; words: raga\b, raag, hindustani, carnatic, sitar | 2 / 0 |
| italian | t0: tags: italian, opera, tarantella, neapolitan; composers: verdi, puccini, rossini, donizetti, bellini, paganini, mascagni, leoncavallo ...; words: tarantella, neapolitan, napoli, o sole mio, funiculi, santa lucia, italian, aria | 481 / 0 |
| jazz | t0: genres: jazz; tags: jazz, ragtime, swing, bigband, creolejazz, copyrightfreeoldjazz, bebop, jazzstandard ...; composers: joplin, ellington, gershwin, jelly roll morton, count basie, thelonious monk, charlie parker; words: rag\b, ragtime, swing, blues, jazz, stomp, boogie | 600 / 0 |
| karadeniz | t0: words: horon, karadeniz, kemence | 1 / 0 |
| karsilama | t0: words: karsilama, rumeli | 0 / 0 |
| khaleeji | t0: tags: khaleeji, saudi, kuwait, emirati, gulf; words: khaleeji, saudi, kuwait, emirat | 2 / 0 |
| maghrebi | t0: tags: moroccan, morocco, algerian, algeria, tunisian, maghreb; words: morocc, maroc, chaabi, gnawa | 2 / 0 |
| mariachi | t0: tags: mexican, mariachi, mexico, calypso, cuban, ranchera; words: mexic, mariachi, ranchera, corridos?\b, huapango, jarabe, cielito, la cucaracha ... | 50 / 0 |
| mevlevi | t0: words: sufi\b, mevlevi, semazen, whirling dervish | 0 / 0 |
| nordic | t0: tags: norwegian, swedish, nordic, finnish, danish, scandinavian, icelandic, norway ...; composers: grieg, sibelius, nielsen, svendsen, halvorsen, sinding, alfven, stenhammar ...; words: norweg, swedish, nordic, finnish, danish, scandinav, halling, springar ... | 163 / 0 |
| persian | t0: tags: persian, iran, iranian, dastgah, santur; words: dastgah, santur, santoor, iran\b, iranian | 4 / 0 |
| pop | t0: genres: pop; tags: pop, kpop, jpop, synthpop, electropop / t1: genres: rock | 600 / 0 |
| rnb | t0: genres: rbfunksoul; tags: rnb, soul, motown, neosoul, gospel; words: soul\b, motown | 600 / 0 |
| romantic | t0: tags: romantic, nocturne, romanticperiod; composers: chopin, schumann, schubert, brahms, liszt, mendelssohn, field, faure ...; words: nocturne, romance, lieder, song without words / t1: genres: classical; tags: pianosolo | 600 / 0 |
| russian | t0: tags: russian, russia; composers: tchaikovsky, rachmaninoff, rachmaninov, mussorgsky, rimsky, glinka, borodin, scriabin ...; words: russian, russia, katyusha, kalinka, korobeiniki, balalaika | 308 / 0 |
| salsa | t0: tags: salsa, mambo, latinjazz, cuban, rumba, chachacha, bolero; words: salsa, mambo, cha cha, son montuno, rumba, danzon, guajira, montuno ... | 41 / 0 |
| samba | t0: tags: samba, choro, brasil, brazilian; composers: pixinguinha, nazareth, abreu, jacob do bandolim, barroso; words: samba, maxixe, tico tico, aquarela, carioca, brasileirinho | 72 / 0 |
| slavic | t0: tags: polish, polonica, czech, slavic, ukrainian, serbian, croatian, bulgarian ...; composers: dvorak, smetana, janacek, moniuszko, fibich, suk, glinka, lysenko ...; words: polish, mazurka, mazurek, polonaise, polonez, krakowiak, oberek, kujawiak ... | 516 / 0 |
| spguitar | t0: tags: classicalguitar, spanish, spain; composers: tarrega, albeniz, sor, giuliani, carcassi, aguado, granados, villa-lobos ...; words: romanza, lagrima, recuerdos, asturias, malaguena, spanish romance | 218 / 0 |
| tango | t0: tags: tango, milonga; composers: piazzolla, gardel, villoldo, canaro, di sarli, matos rodriguez; words: tango, milonga, cumparsita, por una cabeza, libertango | 78 / 0 |
| thai | t0: tags: thai, thailand; words: thai\b, thailand, siam\b, siamese | 5 / 0 |
| westafrica | t0: tags: african, ghana, nigeria, senegal, mali, westafrican, kora; words: african, ghana, nigeria, senegal, mali\b, kora\b, djembe | 14 / 0 |
| zeybek | t0: words: zeybek, efe\b | 0 / 0 |

### Pieces used and skipped

- nottingham: parsed, no phrase passed the window rules: 56
- nottingham: skipped book xmas (not mapped) (tunes): 13
- nottingham: tunes (key sections) parsed: 1133
- pdmx: csv rows: 254077
- pdmx: parsed, no phrase passed the window rules: 912
- pdmx: pieces selected by cards-map.json: 8387
- pdmx: pieces with phrases: 7419
- pdmx: rows outside the licence-clean subset (not used): 31221
- pdmx: selected but missing from mid.tar.gz: 0
- pdmx: skipped: melody shorter than 8 notes: 56
- symbtr: parsed, no phrase passed the window rules: 15
- symbtr: pieces parsed: 1987
- symbtr: skipped: form not used (seyir/etüd/örnek): 210
- symbtr: skipped: no usul row: 2
- symbtr: skipped: repeat-measure code (Kod 35): 1

### Judgements to know when listening

- SymbTr is mostly Ottoman / Turkish art music (şarkı, peşrev, saz semaisi, ilahi); the regional cards (karadeniz, icanadolu, dogu, zeybek, akdeniz, karsilama) get their own region's türküs where the file names a place, plus the makam family of the spec. Deviations from the spec's family list, following the cards' scales in genres.ts: dogu (HICAZ) takes the hicaz family, zeybek (USSAK) the uşşak family; greek (HICAZ) also takes the hicaz family. Seyir, etüd and örnek öz files are scale demonstrations / exercises and are not used.
- SymbTr bars = one usul cycle; cycles longer than two whole notes (devr-i kebir, muhammes, zencir, ...) are split into the fewest equal sub-bars of at most two whole notes whose count divides the usul's numerator.
- Western degrees: a pitch is read as a degree of its own key's 7-note mode (chromatic notes by their usual function: the leading tone in minor and the flat 7th in major are both the 7th), then kept as the same index on a 7-note card (a major tune on a minor card becomes its parallel-minor line; the site renders `scale` and `scaleWish` from the same degrees) or moved to the nearest note on a pentatonic card. SymbTr pitches go to the nearest comma degree of the card's scale (card semitones x 53/12). The octave of the tonic is the one that puts the most notes into [-2, 9].
- PDMX melody = the top line of the highest part among those with >= 30% of the busiest part's notes (not the busiest part: a cello or a left hand can be busier); key = the first key signature's major / relative-minor pair, chosen by the Krumhansl-Kessler profile; a key change ends the piece; time-signature events are bar lines (the PDMX MIDI writes a pickup or another irregular measure as its own short time signature: such a measure is not a bar, so pickups do not shift the grid).
- Nottingham tunes are read from the ABC (written bars, so pickups are exact); repeats are not expanded; a K: change starts a new piece; the Christmas book is not used.
