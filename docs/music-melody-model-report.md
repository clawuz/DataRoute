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

## Evaluation

Written by `scripts/music/melody/evaluate.py --write` (exit code 1 when an acceptance rule fails). The corpus of a card is the sources its bank was trained on (`sources`; a grammar-only card is compared with every shippable source, plus SymbTr for the makam cards when the local bank exists), an evenly spaced sample of at most 2000 phrases. The bank is `melody-bank.local.json` for the cards it trains on SymbTr ("local"), else `melody-bank.json`. The walk is the old hook melody (`phraseMotifs` without a bank), 200 phrases per card dumped by `globe/scripts/dump-walk-phrases.ts` into `scripts/music/melody/walk-samples.json`. Moves are intervals between consecutive sounding notes in scale degrees (rests skipped, clipped to +-5): step = 1, leap >= 2, repeat = 0; rest = the share of slots that are rests (the corpus reduced to h slots). KL = D(x || corpus) of the 11-bin interval distribution, add-0.5 smoothing. Recurrence = the share of phrases with a bar that repeats or sequences an earlier bar (the model's bar similarity: at least 75% of the slots before the cadence agree, transposed by 0, +-1 or +-2), "motifs" = the mean number of distinct bar-motifs per phrase (4 = every bar new); for a trained card the bank's recurrence is given for the whole entry and for its trained part (without the 30% grammar phrases).

### Acceptance

- `melody-bank.json`: cadence hit 96736/96736 bars (100.0%), 0 bars end on a rest.
- `melody-bank.local.json`: cadence hit 100612/100612 bars (100.0%), 0 bars end on a rest.
- KL(bank, corpus) < KL(walk, corpus) for 72 of 72 (card, hits) pairs of the 36 trained cards (smallest margin 0.015, pop hits 6).
- Recurrence of the bank at most 15 points above the corpus's for every trained card and hits (largest excess +13 points, karadeniz hits 6).
- Result: PASS

### Averages

| group | hits | cards | KL bank | KL walk | recurrence corpus / bank / trained part / walk | motifs corpus / bank / trained part / walk |
|---|---|---|---|---|---|---|
| trained | 6 | 36 | 0.051 | 0.122 | 57% / 65% / 56% / 100% | 3.17 / 3.06 / 3.24 / 2.84 |
| trained | 8 | 36 | 0.041 | 0.121 | 45% / 50% / 42% / 100% | 3.36 / 3.30 / 3.48 / 2.99 |
| trained (shippable) | 6 | 23 | 0.047 | 0.110 | 62% / 70% / 61% / 100% | 3.04 / 2.97 / 3.14 / 2.89 |
| trained (shippable) | 8 | 23 | 0.045 | 0.111 | 54% / 58% / 52% / 100% | 3.21 / 3.21 / 3.35 / 2.99 |
| trained (local, SymbTr) | 6 | 13 | 0.056 | 0.143 | 47% / 55% / 46% / 100% | 3.39 / 3.22 / 3.43 / 2.75 |
| trained (local, SymbTr) | 8 | 13 | 0.034 | 0.140 | 29% / 36% / 25% / 100% | 3.64 / 3.46 / 3.71 / 2.98 |
| grammar-only with a corpus | 6 | 16 | 0.214 | 0.127 | 62% / 87% / - / 96% | 3.09 / 2.17 / - / 2.91 |
| grammar-only with a corpus | 8 | 16 | 0.230 | 0.127 | 51% / 79% / - / 94% | 3.28 / 2.35 / - / 3.04 |

### Per card (hits 8; hits 6 in the KL column after the slash)

Shares in %, step / leap / repeat / rest.

| card | bank | sources | corpus (s / p / n) | corpus | bank | walk | KL bank (8 / 6) | KL walk (8 / 6) | recurrence corpus / bank / trained / walk | motifs corpus / bank / walk |
|---|---|---|---|---|---|---|---|---|---|---|
| afrobeat | shippable (grammar) | grammar | 0 / 17 / 0 | 58 / 32 / 10 / 4 | 37 / 40 / 23 / 16 | 40 / 28 / 32 / 0 | 0.138 / 0.144 | 0.231 / 0.204 | 47 / 100 / - / 100 | 3.41 / 2.00 / 3.00 |
| akdeniz | local | symbtr+grammar | 5909 / 0 / 0 | 59 / 11 / 30 / 2 | 61 / 12 / 27 / 3 | 53 / 24 / 23 / 0 | 0.011 / 0.043 | 0.155 / 0.152 | 26 / 30 / 27 / 100 | 3.68 / 3.67 / 2.98 |
| anatolian | local | symbtr+pdmx+grammar | 13566 / 174 / 0 | 55 / 10 / 35 / 2 | 60 / 10 / 30 / 3 | 53 / 19 / 28 / 0 | 0.020 / 0.046 | 0.090 / 0.084 | 32 / 42 / 33 / 100 | 3.59 / 3.52 / 2.96 |
| andean | shippable (grammar) | grammar | 0 / 381 / 0 | 49 / 15 / 36 / 6 | 44 / 46 / 10 / 6 | 50 / 23 / 28 / 0 | 0.397 / 0.341 | 0.060 / 0.070 | 49 / 34 / - / 100 | 3.33 / 3.66 / 2.98 |
| arabic | local | symbtr+pdmx+grammar | 5831 / 147 / 0 | 59 / 11 / 30 / 2 | 60 / 13 / 27 / 3 | 55 / 20 / 24 / 0 | 0.013 / 0.039 | 0.070 / 0.061 | 27 / 28 / 29 / 100 | 3.66 / 3.69 / 2.97 |
| baroque | shippable | pdmx+grammar | 0 / 13975 / 0 | 50 / 32 / 18 / 2 | 57 / 23 / 19 / 2 | 58 / 30 / 12 / 0 | 0.030 / 0.035 | 0.095 / 0.098 | 37 / 41 / 38 / 100 | 3.51 / 3.53 / 2.96 |
| bollywood | shippable (grammar) | grammar | 0 / 121 / 0 | 45 / 21 / 34 / 4 | 44 / 38 / 18 / 8 | 53 / 27 / 20 / 0 | 0.120 / 0.234 | 0.083 / 0.069 | 37 / 100 / - / 100 | 3.50 / 2.41 / 2.98 |
| bossa | shippable | pdmx+grammar | 0 / 532 / 0 | 33 / 24 / 43 / 7 | 39 / 31 / 30 / 6 | 47 / 33 / 21 / 0 | 0.057 / 0.068 | 0.194 / 0.190 | 62 / 73 / 62 / 100 | 3.03 / 3.03 / 3.00 |
| calm | shippable | pdmx+grammar | 0 / 2696 / 0 | 40 / 34 / 27 / 4 | 51 / 23 / 27 / 3 | 50 / 20 / 31 / 0 | 0.062 / 0.062 | 0.122 / 0.114 | 58 / 52 / 58 / 100 | 3.09 / 3.41 / 2.99 |
| caucasus | shippable (grammar) | grammar | 0 / 255 / 0 | 50 / 24 / 26 / 3 | 45 / 33 / 21 / 4 | 54 / 22 / 24 / 0 | 0.138 / 0.157 | 0.086 / 0.086 | 57 / 100 / - / 100 | 3.24 / 1.52 / 2.99 |
| celtic | shippable | pdmx+nottingham+grammar | 0 / 3349 / 5493 | 46 / 34 / 19 / 1 | 50 / 27 / 23 / 1 | 45 / 37 / 18 / 0 | 0.031 / 0.024 | 0.052 / 0.054 | 49 / 59 / 42 / 100 | 3.36 / 2.91 / 3.00 |
| centralasia | shippable (grammar) | grammar | 0 / 59 / 0 | 24 / 15 / 61 / 2 | 48 / 32 / 19 / 5 | 43 / 25 / 32 / 0 | 0.444 / 0.335 | 0.247 / 0.262 | 73 / 100 / - / 100 | 2.80 / 1.52 / 2.98 |
| chanson | shippable | pdmx+grammar | 0 / 3701 / 0 | 40 / 30 / 29 / 4 | 53 / 22 / 26 / 3 | 52 / 30 / 18 / 0 | 0.046 / 0.055 | 0.137 / 0.130 | 63 / 53 / 62 / 100 | 3.05 / 3.34 / 2.99 |
| chinese | shippable (grammar) | grammar | 0 / 285 / 0 | 43 / 21 / 36 / 3 | 47 / 44 / 10 / 6 | 49 / 33 / 19 / 0 | 0.279 / 0.237 | 0.129 / 0.139 | 59 / 48 / - / 100 | 3.25 / 3.45 / 2.99 |
| cinematic | shippable | pdmx+grammar | 0 / 5367 / 0 | 36 / 35 / 28 / 4 | 50 / 25 / 25 / 3 | 50 / 33 / 17 / 0 | 0.066 / 0.058 | 0.115 / 0.107 | 57 / 55 / 58 / 100 | 3.10 / 3.34 / 2.99 |
| classical | shippable | pdmx+grammar | 0 / 10001 / 0 | 45 / 31 / 24 / 5 | 58 / 21 / 22 / 4 | 55 / 32 / 13 / 0 | 0.054 / 0.041 | 0.122 / 0.113 | 53 / 50 / 51 / 100 | 3.29 / 3.42 / 3.00 |
| country | shippable | pdmx+nottingham+grammar | 0 / 4215 / 3632 | 43 / 33 / 24 / 2 | 46 / 34 / 20 / 4 | 49 / 30 / 21 / 0 | 0.030 / 0.008 | 0.066 / 0.060 | 53 / 66 / 51 / 100 | 3.22 / 3.11 / 2.99 |
| cumbia | shippable (grammar) | grammar | 0 / 126 / 0 | 40 / 24 / 37 / 8 | 45 / 35 / 20 / 9 | 41 / 27 / 32 / 0 | 0.153 / 0.195 | 0.103 / 0.105 | 61 / 100 / - / 100 | 3.17 / 2.45 / 3.00 |
| dance | shippable | pdmx+grammar | 0 / 5609 / 0 | 36 / 28 / 36 / 5 | 39 / 30 / 31 / 4 | 37 / 32 / 30 / 0 | 0.020 / 0.030 | 0.073 / 0.093 | 57 / 69 / 56 / 100 | 3.12 / 3.06 / 3.00 |
| dogu | local | symbtr+grammar | 6564 / 0 / 0 | 57 / 10 / 33 / 2 | 50 / 17 / 33 / 2 | 37 / 27 / 36 / 0 | 0.071 / 0.074 | 0.256 / 0.279 | 31 / 44 / 20 / 100 | 3.60 / 3.11 / 2.98 |
| eastafrica | shippable (grammar) | grammar | 0 / 118 / 0 | 31 / 24 / 45 / 4 | 24 / 47 / 29 / 12 | 39 / 29 / 32 / 0 | 0.159 / 0.141 | 0.072 / 0.081 | 71 / 100 / - / 100 | 2.81 / 1.00 / 3.00 |
| eastasia | shippable | pdmx+grammar | 0 / 674 / 0 | 45 / 19 / 36 / 5 | 47 / 24 / 29 / 5 | 39 / 40 / 21 / 0 | 0.051 / 0.039 | 0.179 / 0.193 | 49 / 45 / 49 / 100 | 3.32 / 3.41 / 3.00 |
| epic | shippable | pdmx+grammar | 0 / 4773 / 0 | 37 / 34 / 29 / 4 | 39 / 34 / 28 / 4 | 42 / 41 / 17 / 0 | 0.018 / 0.023 | 0.082 / 0.075 | 60 / 70 / 58 / 100 | 3.04 / 2.97 / 2.99 |
| fado | shippable (grammar) | grammar | 0 / 355 / 0 | 40 / 33 / 27 / 6 | 66 / 19 / 15 / 2 | 60 / 23 / 17 / 0 | 0.182 / 0.111 | 0.136 / 0.101 | 36 / 72 / - / 100 | 3.52 / 3.22 / 2.96 |
| flamenco | shippable (grammar) | grammar | 0 / 146 / 0 | 38 / 32 / 30 / 3 | 67 / 11 / 21 / 5 | 51 / 18 / 31 / 0 | 0.301 / 0.281 | 0.190 / 0.184 | 43 / 47 / - / 100 | 3.47 / 3.39 / 2.97 |
| funk | shippable | pdmx+grammar | 0 / 3866 / 0 | 33 / 24 / 43 / 6 | 37 / 23 / 40 / 8 | 30 / 32 / 38 / 0 | 0.022 / 0.051 | 0.069 / 0.073 | 56 / 67 / 53 / 100 | 3.14 / 2.94 / 2.98 |
| gamelan | shippable (grammar) | grammar | 0 / 20 / 0 | 17 / 30 / 53 / 8 | 33 / 34 / 34 / 10 | 34 / 29 / 37 / 0 | 0.174 / 0.137 | 0.139 / 0.149 | 55 / 100 / - / 100 | 3.40 / 1.00 / 3.00 |
| greek | local | symbtr+pdmx+grammar | 5932 / 197 / 0 | 59 / 11 / 30 / 2 | 53 / 20 / 27 / 2 | 45 / 29 / 26 / 0 | 0.058 / 0.057 | 0.193 / 0.211 | 29 / 41 / 16 / 100 | 3.63 / 3.17 / 3.00 |
| hindustani | shippable (grammar) | grammar | 0 / 14 / 0 | 49 / 24 / 27 / 0 | 58 / 7 / 36 / 3 | 50 / 21 / 29 / 0 | 0.170 / 0.130 | 0.055 / 0.061 | 21 / 0 / - / 10 | 3.79 / 4.00 / 3.90 |
| icanadolu | local | symbtr+grammar | 9221 / 0 / 0 | 57 / 9 / 34 / 2 | 59 / 9 / 32 / 3 | 53 / 19 / 28 / 0 | 0.018 / 0.048 | 0.101 / 0.094 | 29 / 34 / 31 / 100 | 3.63 / 3.59 / 2.96 |
| italian | shippable | pdmx+grammar | 0 / 7129 / 0 | 45 / 32 / 24 / 4 | 53 / 23 / 24 / 2 | 45 / 37 / 18 / 0 | 0.037 / 0.043 | 0.083 / 0.101 | 51 / 56 / 51 / 100 | 3.25 / 3.30 / 3.00 |
| jazz | shippable | pdmx+grammar | 0 / 5788 / 0 | 37 / 35 / 28 / 6 | 41 / 32 / 27 / 9 | 42 / 40 / 18 / 0 | 0.020 / 0.027 | 0.082 / 0.088 | 44 / 55 / 36 / 100 | 3.37 / 3.12 / 3.00 |
| karadeniz | local | symbtr+pdmx+grammar | 8592 / 8 / 0 | 57 / 10 / 33 / 3 | 51 / 18 / 31 / 2 | 47 / 22 / 30 / 0 | 0.090 / 0.093 | 0.149 / 0.146 | 29 / 41 / 16 / 100 | 3.63 / 3.19 / 2.98 |
| karsilama | local | symbtr+grammar | 6470 / 0 / 0 | 58 / 9 / 33 / 2 | 56 / 16 / 28 / 2 | 48 / 27 / 25 / 0 | 0.064 / 0.120 | 0.239 / 0.253 | 31 / 42 / 18 / 100 | 3.61 / 3.12 / 3.00 |
| khaleeji | local | symbtr+pdmx+grammar | 5831 / 21 / 0 | 57 / 9 / 33 / 2 | 62 / 9 / 29 / 2 | 52 / 21 / 28 / 0 | 0.025 / 0.060 | 0.150 / 0.158 | 29 / 38 / 29 / 100 | 3.64 / 3.53 / 2.98 |
| maghrebi | local | symbtr+pdmx+grammar | 5831 / 14 / 0 | 57 / 9 / 33 / 2 | 61 / 10 / 30 / 2 | 51 / 23 / 27 / 0 | 0.023 / 0.054 | 0.198 / 0.205 | 30 / 36 / 29 / 100 | 3.63 / 3.50 / 2.99 |
| mariachi | shippable (grammar) | grammar | 0 / 350 / 0 | 34 / 30 / 36 / 6 | 49 / 28 / 22 / 3 | 43 / 33 / 24 / 0 | 0.127 / 0.130 | 0.087 / 0.088 | 57 / 100 / - / 100 | 3.05 / 1.61 / 3.00 |
| mevlevi | local | symbtr+grammar | 17332 / 0 / 0 | 50 / 15 / 34 / 2 | 54 / 15 / 30 / 3 | 58 / 18 / 24 / 0 | 0.012 / 0.019 | 0.049 / 0.040 | 25 / 30 / 24 / 100 | 3.68 / 3.61 / 2.96 |
| nordic | shippable | pdmx+nottingham+grammar | 0 / 1555 / 295 | 41 / 32 / 27 / 3 | 54 / 20 / 26 / 2 | 50 / 20 / 31 / 0 | 0.065 / 0.053 | 0.109 / 0.104 | 61 / 53 / 60 / 100 | 3.06 / 3.25 / 2.99 |
| persian | local | symbtr+pdmx+grammar | 14560 / 85 / 0 | 60 / 12 / 29 / 3 | 64 / 11 / 25 / 3 | 53 / 20 / 27 / 0 | 0.016 / 0.028 | 0.059 / 0.057 | 26 / 33 / 27 / 100 | 3.68 / 3.66 / 2.96 |
| pop | shippable | pdmx+grammar | 0 / 8428 / 0 | 34 / 29 / 37 / 6 | 37 / 33 / 30 / 5 | 37 / 32 / 30 / 0 | 0.042 / 0.066 | 0.074 / 0.081 | 54 / 64 / 49 / 100 | 3.18 / 3.12 / 3.00 |
| rnb | shippable | pdmx+grammar | 0 / 4588 / 0 | 37 / 28 / 35 / 5 | 42 / 28 / 31 / 7 | 45 / 32 / 24 / 0 | 0.034 / 0.038 | 0.080 / 0.082 | 54 / 66 / 51 / 100 | 3.18 / 2.94 / 3.00 |
| romantic | shippable | pdmx+grammar | 0 / 7485 / 0 | 39 / 35 / 26 / 4 | 53 / 24 / 23 / 3 | 53 / 33 / 14 / 0 | 0.076 / 0.079 | 0.184 / 0.183 | 54 / 52 / 53 / 100 | 3.19 / 3.38 / 3.00 |
| russian | shippable | pdmx+grammar | 0 / 3469 / 0 | 41 / 32 / 26 / 4 | 55 / 21 / 24 / 3 | 57 / 26 / 18 / 0 | 0.071 / 0.067 | 0.130 / 0.116 | 57 / 58 / 56 / 100 | 3.16 / 3.34 / 2.98 |
| salsa | shippable (grammar) | grammar | 0 / 291 / 0 | 35 / 32 / 33 / 7 | 38 / 41 / 21 / 16 | 41 / 32 / 27 / 0 | 0.094 / 0.125 | 0.076 / 0.081 | 53 / 100 / - / 100 | 3.16 / 2.00 / 3.00 |
| samba | shippable | pdmx+grammar | 0 / 846 / 0 | 37 / 30 / 33 / 5 | 39 / 30 / 31 / 6 | 43 / 30 / 27 / 0 | 0.008 / 0.032 | 0.077 / 0.081 | 47 / 59 / 42 / 100 | 3.31 / 3.25 / 3.00 |
| slavic | shippable | pdmx+grammar | 0 / 4096 / 0 | 45 / 29 / 26 / 3 | 52 / 24 / 24 / 2 | 55 / 24 / 21 / 0 | 0.043 / 0.035 | 0.065 / 0.057 | 59 / 72 / 60 / 100 | 3.14 / 2.75 / 2.98 |
| spguitar | shippable | pdmx+grammar | 0 / 3095 / 0 | 30 / 44 / 26 / 2 | 48 / 29 / 23 / 1 | 57 / 25 / 18 / 0 | 0.125 / 0.130 | 0.262 / 0.231 | 49 / 55 / 49 / 100 | 3.30 / 3.36 / 2.98 |
| tango | shippable | pdmx+grammar | 0 / 928 / 0 | 43 / 27 / 30 / 5 | 51 / 21 / 29 / 3 | 49 / 29 / 23 / 0 | 0.032 / 0.025 | 0.095 / 0.097 | 49 / 52 / 49 / 100 | 3.33 / 3.45 / 2.98 |
| thai | shippable (grammar) | grammar | 0 / 48 / 0 | 28 / 21 / 51 / 3 | 44 / 47 / 9 / 5 | 45 / 32 / 24 / 0 | 0.443 / 0.434 | 0.189 / 0.189 | 33 / 62 / - / 100 | 3.62 / 3.31 / 3.00 |
| westafrica | shippable (grammar) | grammar | 0 / 86 / 0 | 40 / 11 / 49 / 4 | 27 / 43 / 29 / 13 | 39 / 29 / 32 / 0 | 0.361 / 0.301 | 0.155 / 0.166 | 60 / 100 / - / 100 | 2.93 / 1.00 / 3.00 |
| zeybek | local | symbtr+grammar | 8661 / 0 / 0 | 57 / 10 / 34 / 2 | 61 / 9 / 30 / 3 | 56 / 20 / 25 / 0 | 0.021 / 0.053 | 0.116 / 0.114 | 28 / 34 / 29 / 100 | 3.65 / 3.58 / 2.97 |

### The five most common 4-note patterns (hits 8; three intervals, share of all 4-note windows in %)

| card | corpus | bank | walk |
|---|---|---|---|
| afrobeat | `+1-1+1` 9.6, `-1+1-1` 8.2, `-1-1+1` 4.8, `-1-1-1` 3.7, `-1+1-2` 2.8 | `+1+1+1` 5.9, `+0+1+1` 2.1, `-1-1+0` 2.0, `+0-1-1` 2.0, `+0+0-2` 1.8 | `+0+0+0` 3.4, `-1+0+0` 2.6, `+0-1+0` 2.4, `+0+0-1` 2.4, `+1+0+0` 2.0 |
| akdeniz | `+0+0+0` 8.4, `-1-1-1` 6.2, `-1-1+1` 4.6, `-1+1+1` 4.1, `+1-1-1` 4.0 | `-1-1-1` 6.9, `+0+0+0` 6.1, `+0-1-1` 4.7, `+1-1-1` 4.5, `-1-1+1` 4.3 | `-1-1-1` 4.5, `-1-1+0` 2.9, `+0-1-1` 2.6, `-1+0-1` 2.4, `-1+0+0` 2.3 |
| anatolian | `+0+0+0` 10.5, `-1-1-1` 4.7, `+0+0-1` 4.2, `+0-1+0` 4.2, `-1+0-1` 4.0 | `+0+0+0` 5.6, `-1-1-1` 5.3, `+0-1-1` 5.3, `+0+0-1` 4.6, `-1-1+1` 4.0 | `-1-1-1` 4.9, `-1-1+0` 3.9, `+0-1-1` 3.9, `-1+0-1` 3.9, `-1+0+0` 3.4 |
| andean | `+0+0+0` 13.1, `-1+1-1` 7.4, `+1-1+1` 6.1, `+0+0-1` 2.6, `-1+0+0` 2.5 | `+1-2+1` 3.6, `+1-1+1` 3.2, `+2-2+2` 3.2, `-2+1-2` 2.8, `-2+2-2` 2.8 | `-1-1-1` 2.9, `+0-1-1` 2.9, `-1+0-1` 2.8, `+0+0-1` 2.7, `-1-1+0` 2.6 |
| arabic | `+0+0+0` 8.1, `-1-1-1` 6.3, `-1-1+1` 4.7, `-1+1+1` 4.1, `+1-1-1` 4.1 | `-1-1-1` 4.7, `+0+0+0` 4.7, `+0+0-1` 4.2, `+0-1-1` 4.1, `-1-1+1` 4.1 | `-1-1-1` 5.4, `-1-1+0` 3.9, `-1+0-1` 3.6, `+0-1-1` 3.2, `-1+0+0` 3.1 |
| baroque | `+0+0+0` 5.3, `-1-1-1` 5.2, `+1+1+1` 3.2, `-1+1-1` 3.1, `+1-1+1` 2.9 | `-1-1-1` 5.7, `-1-1+1` 4.2, `+0+0+0` 4.0, `-1+1+1` 3.9, `+1+1+1` 3.7 | `-1-1-1` 3.1, `-1-1+1` 2.6, `+1+1+1` 2.6, `+1-1-1` 2.5, `+1+1-1` 2.4 |
| bollywood | `+0+0+0` 6.7, `-1-1+1` 3.4, `-1+1-1` 3.3, `+0+0-1` 3.3, `+1-1-1` 3.0 | `-1+1-1` 2.9, `+1-1+1` 2.3, `+1-1-1` 1.9, `+0-1+0` 1.7, `-1-1+1` 1.7 | `-1-1-1` 4.0, `-1-1+0` 2.2, `-1+0-1` 1.9, `-1+1+1` 1.8, `+0-1-1` 1.7 |
| bossa | `+0+0+0` 19.3, `+0+0-1` 3.4, `-1-1-1` 2.3, `-1+0+0` 1.9, `+1+0+0` 1.7 | `+0+0+0` 8.0, `+0+0-1` 3.2, `+1+0+0` 2.5, `+1-1+1` 2.1, `-1+1+1` 2.0 | `+1+0-1` 1.5, `+1-1-1` 1.5, `+1+0+1` 1.4, `-1+1+1` 1.4, `-1-1-1` 1.4 |
| calm | `+0+0+0` 8.8, `-1+1-1` 2.0, `+1+0+0` 1.8, `+0+0-1` 1.8, `-1-1+1` 1.8 | `+0+0+0` 5.4, `-1-1-1` 3.4, `+1+1+1` 3.2, `-1-1+1` 2.9, `+0+0-1` 2.9 | `+0+0+0` 3.3, `-1+0+0` 2.9, `+0-1+0` 2.8, `+0+0-1` 2.7, `+1+0-1` 2.6 |
| caucasus | `+0+0+0` 6.6, `-1+1-1` 4.3, `+1-1-1` 4.0, `-1-1+1` 3.5, `-1+1+1` 2.9 | `+0-1+0` 6.3, `-1+0-1` 6.3, `+1-2+1` 4.7, `-2+1-2` 4.1, `+1-1+1` 3.8 | `-1-1-1` 5.0, `-1+0-1` 3.5, `-1-1+0` 3.4, `+0-1-1` 3.0, `-1+0+0` 2.5 |
| celtic | `-1-1-1` 4.5, `+0+0+0` 4.3, `+1+1+1` 3.2, `+1-1-1` 2.3, `-1+1+1` 2.3 | `+0+0+0` 3.7, `+1-1+1` 3.4, `-1+1-1` 3.2, `+1+1+1` 2.9, `-1-1-1` 2.7 | `+1-1-1` 1.5, `-1+1+1` 1.2, `+1+1+0` 1.2, `+1-1+1` 1.1, `+1+1+1` 1.1 |
| centralasia | `+0+0+0` 40.9, `+1+0+0` 3.4, `+0+0+1` 3.3, `+0+0-1` 2.1, `+0-1+1` 2.0 | `+1-1+1` 6.2, `-1+1-1` 6.0, `-1+0-1` 4.2, `-2+2-2` 3.9, `+0-1+0` 3.7 | `+0+0+0` 3.4, `-1+0+0` 3.1, `+0-1+0` 3.1, `-1+0-1` 2.8, `+0+0-1` 2.6 |
| chanson | `+0+0+0` 10.9, `-1-1-1` 3.0, `+1+1+1` 2.5, `+1-1-1` 2.2, `-1-1+1` 2.0 | `+0+0+0` 5.4, `-1-1-1` 4.7, `+1+1+1` 4.0, `-1-1+1` 3.5, `-1+1+1` 3.0 | `-1-1-1` 2.3, `+1-1-1` 2.2, `-1-1+1` 1.8, `-1+1+1` 1.8, `+1+1-1` 1.8 |
| chinese | `+0+0+0` 13.8, `+0+0+1` 2.3, `-1+1+1` 2.2, `+0+0-1` 2.1, `+1-1+1` 2.1 | `+1-1+1` 3.3, `-1+1-1` 2.8, `-1+2-1` 2.5, `+2-2+2` 2.1, `+1-2+1` 2.0 | `+1-1-1` 1.8, `-1+1-1` 1.8, `-1+1+1` 1.7, `-1-1-1` 1.5, `-1+0-1` 1.4 |
| cinematic | `+0+0+0` 10.5, `-1-1-1` 1.9, `-1+1-1` 1.9, `+1-1+1` 1.9, `+1-1-1` 1.6 | `+0+0+0` 7.0, `-1+1+1` 3.6, `+1+1+1` 3.6, `-1-1+1` 3.4, `-1-1-1` 2.8 | `+1-1-1` 1.6, `-1+1+1` 1.6, `+1+0-1` 1.6, `-1-1-1` 1.6, `-1+1-1` 1.5 |
| classical | `+0+0+0` 7.8, `-1-1-1` 4.7, `+1+1+1` 3.4, `+1-1+1` 3.0, `-1+1-1` 2.9 | `-1-1-1` 5.1, `+1+1+1` 4.4, `-1-1+1` 4.0, `+0+0+0` 3.9, `-1+1+1` 3.6 | `+1-1-1` 2.6, `+1+1+1` 2.5, `-1-1-1` 2.4, `-1-1+1` 2.2, `+1+1-1` 2.1 |
| country | `+0+0+0` 6.2, `-1-1-1` 3.7, `+1+1+1` 2.7, `+1-1-1` 2.3, `-1+1+1` 2.3 | `-1-1-1` 3.5, `+0+0+0` 2.9, `+1+1+1` 2.8, `+1+1-1` 2.4, `-1+1+1` 2.2 | `+1-1-1` 2.0, `-1-1-1` 1.9, `+1+0+1` 1.8, `+1+0-1` 1.7, `-1-1+1` 1.5 |
| cumbia | `+0+0+0` 13.3, `-1+1-1` 4.6, `+1-1+1` 4.1, `+1-1+0` 2.8, `-1+0+0` 2.4 | `+1+0+1` 3.4, `+0+1+0` 2.8, `+1+1+1` 2.2, `-1+2-1` 2.2, `+0+1-1` 2.0 | `+0+0+0` 3.6, `+0-1+0` 2.7, `-1+0+0` 2.3, `+0+1+0` 2.3, `+0+0-1` 2.3 |
| dance | `+0+0+0` 13.0, `+0+0-1` 2.6, `-1+1-1` 2.2, `-1+0+0` 2.1, `+1+0+0` 2.0 | `+0+0+0` 6.4, `+0+0-1` 2.9, `+0+0+1` 2.5, `-1+0+0` 2.3, `+1+0+0` 2.3 | `+0+0+0` 3.2, `-1+0+0` 2.1, `+0+1+0` 2.0, `+1+0+0` 2.0, `+0+0-1` 1.8 |
| dogu | `+0+0+0` 9.7, `-1-1-1` 4.9, `+0-1+0` 4.3, `-1+0-1` 4.2, `+0+0-1` 4.2 | `+0+0+0` 7.1, `+0+0-1` 4.0, `-1+1-1` 3.5, `-1+0+0` 3.3, `+1-1+1` 3.2 | `+0+0+0` 5.2, `+0-1+0` 2.9, `+0+0-1` 2.7, `-1+0+0` 2.6, `+0+0+1` 2.6 |
| eastafrica | `+0+0+0` 11.0, `+0+0+1` 3.4, `+0+0-1` 3.3, `-1+0+0` 3.2, `+1+0+0` 2.8 | `+0-2+0` 2.6, `+0+0+0` 2.4, `-2+0+2` 2.3, `+0+2+0` 2.1, `+2+0+0` 1.8 | `+0+0+0` 4.0, `+0-1+0` 2.5, `-1+0+0` 2.4, `+1+0+0` 2.2, `+0+0+1` 2.2 |
| eastasia | `+0+0+0` 11.2, `+1-1+1` 4.6, `-1+1-1` 4.4, `+0+0-1` 2.6, `+1+0+0` 2.5 | `+0+0+0` 5.3, `+1-1+1` 3.8, `-1+1-1` 3.0, `+0+0+1` 2.9, `+1+0+0` 2.7 | `+0+0+0` 1.4, `-1+0+1` 1.4, `+0+1+0` 1.3, `-1+0+0` 1.3, `+0-1+2` 1.3 |
| epic | `+0+0+0` 10.6, `+0+0-1` 1.9, `+1-1-1` 1.8, `-1-1-1` 1.8, `-1-1+1` 1.7 | `+0+0+0` 5.9, `-1+0+0` 2.4, `-1-1-1` 1.9, `+1+0+0` 1.9, `+0+0-1` 1.9 | `+1+0-1` 1.3, `+1+0+1` 1.3, `-1+1+1` 1.2, `+1-1-1` 1.1, `+1+1+0` 1.1 |
| fado | `+0+0+0` 5.9, `-1-1-1` 5.4, `+0+0-1` 2.8, `-1+0+0` 2.1, `+1-1-1` 2.0 | `-1-1-1` 11.1, `-1-1+1` 5.4, `-1+1+1` 4.5, `-1-1+0` 3.6, `+1-1-1` 3.3 | `-1-1-1` 5.2, `-1-1+1` 3.8, `-1+1-1` 3.0, `-1+1+1` 2.6, `-1+0-1` 2.2 |
| flamenco | `+0+0+0` 8.1, `+0+0-1` 2.3, `-1+1+0` 2.2, `+1+0+0` 2.1, `-1-1-1` 1.9 | `-1-1-1` 7.9, `+0-1-1` 5.9, `+1-1-1` 5.5, `+1+0-1` 4.5, `-1+1-1` 3.9 | `-1+0-1` 4.3, `-1-1-1` 4.2, `+0-1-1` 4.0, `-1-1+0` 4.0, `-1+0+0` 3.6 |
| funk | `+0+0+0` 16.3, `+0+0-1` 3.4, `+1+0+0` 2.5, `+0-1+0` 2.3, `+0-1+1` 2.2 | `+0+0+0` 9.9, `+0+0-1` 3.7, `+1+0+0` 3.6, `-1+0+0` 2.8, `+0+0+1` 2.5 | `+0+0+0` 7.0, `+0+0-1` 2.7, `+0+0+1` 2.4, `+0+1+0` 2.3, `+1+0+0` 2.1 |
| gamelan | `+0+0+0` 21.8, `+0+0+2` 4.8, `+0+2+0` 3.8, `-2+0+0` 3.8, `+2-2+0` 3.5 | `+0+0+0` 4.0, `+0+1+0` 2.6, `-2+0+0` 2.4, `+1+0-2` 2.2, `+0-2+0` 2.2 | `+0+0+0` 5.8, `-1+0+0` 2.8, `+0-1+0` 2.7, `+0+0+1` 2.4, `+0+0-1` 2.4 |
| greek | `+0+0+0` 8.3, `-1-1-1` 6.3, `-1-1+1` 4.8, `-1+1+1` 4.2, `+1-1-1` 4.1 | `+0+0+0` 4.9, `-1-1+1` 3.5, `-1+1+1` 3.5, `-1-1-1` 3.5, `-1+1-1` 3.4 | `+0+0+0` 2.3, `+1+0-1` 2.1, `+0-1+0` 2.1, `-1+0+0` 1.9, `+0+1+0` 1.8 |
| hindustani | `+1+1+1` 6.9, `+1+0+1` 4.9, `+0+1+0` 4.2, `+0+0+0` 4.2, `+1+1-1` 3.6 | `+0+1+0` 8.8, `+1+0+1` 7.7, `+1+0+0` 6.9, `+1+1+0` 5.4, `+0+0+0` 5.0 | `+1+1+1` 4.1, `+0+1+1` 3.7, `+1+0+1` 3.7, `+1+1+0` 3.6, `+1+0+0` 3.4 |
| icanadolu | `+0+0+0` 9.9, `-1-1-1` 4.6, `+0-1+0` 4.5, `-1+0-1` 4.4, `+0+0-1` 4.3 | `+0-1-1` 5.7, `+0+0+0` 5.5, `+0+0-1` 5.5, `-1-1-1` 4.9, `-1+0+0` 4.4 | `-1-1-1` 4.9, `-1-1+0` 3.9, `+0-1-1` 3.9, `-1+0-1` 3.9, `-1+0+0` 3.4 |
| italian | `+0+0+0` 7.4, `-1-1-1` 4.4, `-1+1-1` 3.0, `+1-1+1` 3.0, `+1+1+1` 2.4 | `+0+0+0` 5.2, `-1-1-1` 5.1, `-1-1+1` 4.0, `-1+1+1` 3.4, `+1+1+1` 3.2 | `+1-1-1` 1.5, `-1+1+1` 1.2, `+1+1+0` 1.2, `+1-1+1` 1.1, `+1+1+1` 1.1 |
| jazz | `+0+0+0` 8.9, `-1-1-1` 1.9, `+1+1+1` 1.7, `+0+0-1` 1.6, `-1+1-1` 1.6 | `+0+0+0` 5.4, `+1+1+1` 2.2, `-1-1+1` 2.0, `+0+0-1` 2.0, `+1+0+0` 1.9 | `+1+0-1` 1.3, `+1-1-1` 1.2, `+1+0+1` 1.1, `+1+1+0` 1.0, `+1+1+1` 1.0 |
| karadeniz | `+0+0+0` 9.0, `-1-1-1` 4.8, `-1+0-1` 4.7, `+0-1+0` 4.6, `+0+0-1` 4.2 | `+0+0+0` 6.0, `+0+0-1` 4.7, `+0-1+0` 3.9, `-1+0-1` 3.9, `-1-1-1` 3.5 | `-1+0+0` 3.3, `-1+0-1` 3.2, `+0-1-1` 3.2, `+0+0+0` 3.0, `-1-1-1` 3.0 |
| karsilama | `+0+0+0` 9.9, `-1-1-1` 5.5, `-1-1+1` 4.3, `+0+0-1` 4.1, `-1+0-1` 4.1 | `+0+0+0` 5.4, `+1-1+1` 4.4, `-1+1-1` 4.1, `+0+0-1` 3.6, `-1-1-1` 3.3 | `+1+0-1` 2.1, `+0+0+0` 2.0, `+0-1+0` 2.0, `+0-1-1` 1.9, `-1+0+0` 1.9 |
| khaleeji | `+0+0+0` 9.8, `-1-1-1` 5.5, `-1-1+1` 4.2, `+0-1+0` 4.2, `+0+0-1` 4.2 | `-1-1-1` 7.0, `+0+0+0` 6.2, `+0+0-1` 5.4, `+1-1-1` 4.5, `-1+0+0` 4.3 | `-1-1-1` 4.4, `+0-1-1` 3.6, `-1+0-1` 3.5, `-1-1+0` 3.4, `-1+0+0` 2.8 |
| maghrebi | `+0+0+0` 9.8, `-1-1-1` 5.5, `-1-1+1` 4.3, `+0+0-1` 4.2, `+0-1+0` 4.1 | `+0+0+0` 6.2, `-1-1-1` 5.7, `+0+0-1` 4.6, `+0-1-1` 4.4, `+1-1-1` 4.3 | `-1-1-1` 3.6, `+0-1-1` 3.0, `-1-1+0` 2.9, `-1+0-1` 2.8, `-1+0+0` 2.7 |
| mariachi | `+0+0+0` 15.8, `-1-1-1` 2.2, `+0+0-1` 1.9, `+0+0+1` 1.5, `+0-1-1` 1.4 | `+1-1+1` 7.6, `-1+1-1` 6.7, `+0+1+0` 5.5, `+1+0+1` 5.0, `-2+2-2` 2.7 | `+0+0+0` 2.0, `+1+0-1` 1.6, `-1+0-1` 1.6, `+0+1+0` 1.5, `+1+0+1` 1.4 |
| mevlevi | `+0+0+0` 9.1, `-1-1-1` 4.1, `+0+0-1` 3.8, `+0-1+0` 3.2, `-1-1+1` 3.2 | `+0+0+0` 5.9, `+0+0-1` 4.7, `-1-1-1` 4.6, `+0-1-1` 4.1, `+1-1-1` 3.6 | `-1-1-1` 7.0, `-1-1+0` 4.1, `-1+0-1` 3.8, `+0-1-1` 3.3, `-1+0+0` 2.9 |
| nordic | `+0+0+0` 9.0, `-1-1-1` 2.6, `-1+1+1` 2.5, `-1-1+1` 2.3, `+1-1+1` 2.1 | `+0+0+0` 5.0, `+1+1+1` 4.4, `-1+1+1` 3.8, `-1-1-1` 3.5, `-1-1+1` 3.3 | `+0+0+0` 3.3, `-1+0+0` 2.9, `+0-1+0` 2.8, `+0+0-1` 2.7, `+1+0-1` 2.6 |
| persian | `+0+0+0` 7.5, `-1-1-1` 6.4, `-1-1+1` 4.5, `+1-1-1` 4.4, `-1+1+1` 3.7 | `-1-1-1` 6.8, `+0+0+0` 5.0, `+0-1-1` 4.6, `+1-1-1` 4.3, `-1+1-1` 4.0 | `-1-1-1` 4.9, `-1-1+0` 3.9, `+0-1-1` 3.8, `-1+0-1` 3.7, `-1+0+0` 3.4 |
| pop | `+0+0+0` 12.3, `+0+0-1` 2.5, `-1+1-1` 1.9, `+1+0+0` 1.8, `-1+0+0` 1.8 | `+0+0+0` 5.5, `+0+0-1` 2.8, `+1+0+0` 2.6, `+0+0+1` 2.1, `-1-1+1` 1.8 | `+0+0+0` 3.2, `-1+0+0` 2.1, `+0+1+0` 2.0, `+1+0+0` 2.0, `+0+0-1` 1.8 |
| rnb | `+0+0+0` 10.9, `+0+0-1` 2.5, `-1+1-1` 1.8, `+1+0+0` 1.8, `+0-1-1` 1.8 | `+0+0+0` 4.9, `+1+1+1` 3.4, `+0+0-1` 2.7, `-1-1+0` 2.4, `+0+1+1` 2.3 | `+1+0-1` 1.8, `+0+0+0` 1.6, `+1+0+1` 1.6, `-1+0-1` 1.6, `-1+0+0` 1.5 |
| romantic | `+0+0+0` 8.6, `-1+1-1` 3.3, `+1-1+1` 3.2, `-1-1-1` 2.1, `+1+1+1` 1.9 | `+1+1+1` 4.7, `+0+0+0` 4.6, `-1-1-1` 3.1, `+1+1-1` 3.1, `-1-1+1` 2.8 | `-1-1-1` 2.4, `+1+1+1` 2.2, `+1-1-1` 2.2, `-1-1+1` 2.0, `-1+1+1` 1.9 |
| russian | `+0+0+0` 8.7, `-1-1-1` 3.1, `+1+1+1` 2.5, `-1+1-1` 2.4, `+1-1+1` 2.0 | `-1-1-1` 6.8, `+0+0+0` 4.3, `-1-1+1` 3.5, `+1-1-1` 3.3, `-1-1+0` 3.3 | `-1-1-1` 4.2, `-1-1+1` 3.4, `-1+1-1` 2.6, `-1+1+1` 2.1, `+0-1-1` 2.0 |
| salsa | `+0+0+0` 11.8, `-1-1-1` 1.9, `+0+0-1` 1.8, `+1-1-1` 1.7, `+0-1-1` 1.6 | `+1+1+1` 5.4, `+0-1-1` 2.9, `+0+1+1` 2.5, `-2+1+1` 2.1, `-1-1+0` 2.0 | `+0+0+0` 2.4, `-1+0+0` 1.8, `+0+1+0` 1.8, `+0-1+0` 1.7, `+1+0-1` 1.6 |
| samba | `+0+0+0` 10.1, `-1-1-1` 2.5, `+0+0-1` 2.5, `-1+0+0` 1.9, `+1+1+1` 1.8 | `+0+0+0` 6.5, `+0+0-1` 2.8, `-1+0+0` 2.3, `+1+0+0` 2.2, `+0+0+1` 2.1 | `+0+0+0` 2.0, `+0-1+0` 2.0, `+1+0-1` 2.0, `-1+0+0` 1.8, `+0+1+0` 1.7 |
| slavic | `+0+0+0` 7.9, `-1-1-1` 3.8, `-1-1+1` 2.4, `+1+1+1` 2.4, `+1-1-1` 2.3 | `+0-1+0` 3.5, `-1-1+1` 3.4, `-1+1-1` 3.1, `-1+0-1` 3.1, `-1+1+1` 3.0 | `-1-1-1` 4.0, `-1-1+1` 2.9, `-1-1+0` 2.4, `+0-1-1` 2.3, `-1+1+1` 2.3 |
| spguitar | `+0+0+0` 9.0, `-1-1-1` 2.0, `+1+1+1` 1.6, `+0+0-1` 1.4, `-1-1+1` 1.3 | `-1-1-1` 4.9, `+0+0+0` 4.6, `-1-1+1` 3.2, `-1+1+1` 3.1, `+1-1-1` 2.8 | `-1-1-1` 4.2, `-1-1+1` 3.4, `-1+1-1` 2.6, `-1+1+1` 2.2, `+0-1-1` 2.1 |
| tango | `+0+0+0` 9.5, `-1-1-1` 2.7, `+0+0-1` 2.0, `+1-1-1` 2.0, `-1+1-1` 2.0 | `+0+0+0` 5.8, `-1-1-1` 3.6, `+0+0-1` 3.1, `-1+1-1` 2.8, `-1+0+0` 2.8 | `-1-1-1` 2.6, `-1+0-1` 2.0, `-1+0+0` 1.9, `-1-1+0` 1.9, `+0-1-1` 1.8 |
| thai | `+0+0+0` 35.9, `+0+0-1` 1.9, `+1+1+1` 1.9, `-1+0+0` 1.7, `-1-1+1` 1.5 | `+1-2+1` 2.9, `+1-1+1` 2.8, `-2+1+1` 2.4, `-2+2-2` 2.2, `-1+1-1` 1.9 | `+1+0-1` 1.8, `+0+0+0` 1.6, `+1+0+1` 1.6, `-1+0-1` 1.6, `-1+0+0` 1.5 |
| westafrica | `+0+0+0` 19.8, `+0+0-1` 3.7, `+1+0+0` 3.5, `-1+0+0` 3.5, `-1-1+0` 3.2 | `+0-2+0` 2.4, `+0+0+0` 2.2, `-2+0+2` 2.0, `+0+0-2` 1.8, `+0+0+2` 1.7 | `+0+0+0` 4.0, `+0-1+0` 2.5, `-1+0+0` 2.4, `+1+0+0` 2.2, `+0+0+1` 2.2 |
| zeybek | `+0+0+0` 9.4, `-1-1-1` 4.9, `+0-1+0` 4.5, `-1+0-1` 4.4, `+0+0-1` 4.4 | `-1-1-1` 5.8, `+0+0+0` 5.6, `+0+0-1` 5.0, `+0-1-1` 4.0, `+1-1-1` 3.9 | `-1-1-1` 5.7, `-1-1+0` 4.0, `-1+0-1` 3.7, `+0-1-1` 3.4, `-1+0+0` 2.8 |

## Evaluation: reading

Written by hand. The tables above are rewritten by `evaluate.py --write`; this reading is not, so check it against the tables after a re-export.

**The trained bank is much closer to the corpus than the old walk.** The mean interval KL of the 36 trained cards is 0.051 at hits 6 and 0.041 at hits 8. For the walk it is 0.122 and 0.121, so the bank is about 2.5 to 3 times closer. Every trained card beats the walk at both hits. The smallest margin is pop at hits 6: 0.066 for the bank against 0.081 for the walk.

**Where the bank is close to the corpus** (KL at hits 8 of 0.025 or less):
- samba, dance, epic, jazz, funk;
- the SymbTr makam cards mevlevi, persian, akdeniz, arabic, icanadolu, zeybek, maghrebi, khaleeji, anatolian.

In these cards the step, leap and repeat shares are within a few points of the corpus, and so is the rest share (2-9%, while the walk never rests). The most common 4-note pattern of the corpus is a repeated note (`+0+0+0`) on almost every card. The bank keeps it among its first four patterns, at about 50-65% of the corpus's rate. The walk has it only on the repeat-heavy cards (funk, pop).

**Where the bank is not close:**
- **Too stepwise:** spguitar (KL 0.125), romantic, russian, nordic, calm, cinematic, classical, chanson. Their corpora leap 31-44% of the time; the bank leaps 20-29%. Three causes:
  - the forced cadence at the end of every bar;
  - the rule that the note before it is at most 2 degrees away;
  - the likelihood rerank, which favours steps.

  spguitar, whose corpus is arpeggio-heavy guitar music, is furthest away. It still beats the walk (0.262).
- **Makam cards with too many leaps:** karadeniz, dogu, karsilama, greek (KL 0.058-0.12). The bank leaps 16-20% against the corpus's 9-11%. The leaps come from the 30% grammar share (the seyir and cyclic forms), not from the trained phrases. To keep the whole entry within 15 points of the corpus's recurrence, these cards also had their trained part pushed below the corpus's recurrence (16-20% against about 30%), because their grammar phrases nearly all recur.

**Structure (bar reuse).** Measured with the model's bar similarity:
- The trained part of the bank repeats or sequences a bar about as often as the corpus: 56% against 57% at hits 6, 42% against 45% at hits 8.
- The whole entry is 5-8 points higher because of the grammar phrases. The largest excess is +13 points (karadeniz, hits 6), within the 15-point rule.
- Distinct bar-motifs per phrase (mean over the trained cards): 3.17 / 3.36 in the corpus at hits 6 / 8, and 3.06 / 3.30 in the bank.
- The walk scores 100% recurrence because its bar 3 copies bar 1 whenever the cadence allows. It is the most repetitive and the least varied.
- The Task 2 worry that trained phrases are new/new/new came from the operator tags, which count only literal copies. Measured on the notes, the reuse was already close to the corpus. It is now calibrated per card (see "Structure tuning" below).

**Grammar-only cards.** These cards' banks are not trained:
- afrobeat, andean, bollywood, caucasus, centralasia, chinese, cumbia, eastafrica, fado, flamenco, gamelan, hindustani, mariachi, salsa, thai and westafrica: their corpus is under 400 phrases or under 40 pieces;
- the 13 makam cards, in the shippable file only.

The 16 listed cards have small corpora, and against them the grammar's mean KL is 0.21-0.23, worse than the walk's 0.127. The grammar forms leap more than these small corpora: andean 46% against 15%, thai 47% against 21%. They also always reuse material. The evidence is weak (14-381 keyword-mapped PDMX phrases), but for these cards `?melody=bank` is not more corpus-like than the walk.

**Structure tuning (Task 3).** Changes to `train.py`, each checked against the acceptance rules:
- `MATCH`: 0.75 and 0.67 were swept, and 0.75 is kept. 0.67 only changes hits 4, 7 and 8; it counts a 2-in-3 agreement as a repeat and lifts the corpus's own rate at hits 8 from 45% to 66% without bringing the moves closer.
- **Reuse:** the reuse bonus is now calibrated per (card, hits), as a quota. The rerank pool has the corpus's share of recurring phrases. That share is lowered only as far as needed to keep the mixed entry within 15 points of the corpus (`REUSE_CAP` 0.12, which leaves 3 points of margin).
- **Pool order:** the 64 phrases are a fixed pseudo-random sample of the pool, no longer its head. The head of a likelihood ranking is mostly steps.
- **Held bars:** the Task 2 penalty (-0.75 per bar held for more than half its slots) took the repeats out of funk and pop, whose KL was then above the walk's. With no penalty, held bars were 2-3 times the corpus's rate. The penalty is now calibrated per (card, hits) so that the share of held bars matches the corpus (padding not counted).
- **Cadence approach:** the note before each forced cadence is drawn weighted by the model's probability of the move into the cadence (`CADENCE_AWARE`). Without it, the forced arrivals were mostly ±2 degrees; this was the last fix for funk and pop at hits 6.
