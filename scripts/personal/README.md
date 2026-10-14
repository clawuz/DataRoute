# Personal catalog (A World of Music v2)

`globe/src/personal/destinations.json` and `direct.json` are generated, then checked in.

1. `parse_wiki.py` — parses the wikitext of "List of Turkish Airlines destinations" (rows: country, city, airport, status).
2. `match2.py` — matches airports to OurAirports (`airports.csv`, public domain) for IATA + coordinates; keeps every row that is not Terminated (Passenger, Seasonal, Future, Suspended, Cargo). THY's own 133-country / 355-destination figure counts suspended and cargo-only points too: active+seasonal alone is 122 countries, all-but-terminated is exactly 133.
3. Live additions: airports served from IST in the 24 h `day.json` feed (SFO, SVO, MEL, ...). Cargo-only airports are left out.
4. `direct.json` — non-hub flights seen in the live feed: any pair with a Turkish end (Anatolian spokes) plus the tag flights KUL–SYD, MEL–SIN, GRU–SCL, BOM–HAN. Everything else is routed through IST.

Re-run when the network changes; the 24 h feed is a snapshot, so weekly-only routes can be missing from `direct.json`.
