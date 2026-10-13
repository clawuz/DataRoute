import json,csv,re,unicodedata,collections
exec(open('match.py').read().split("air=[r for r")[0])  # names, alias, norm, valid
air=[r for r in csv.DictReader(open('airports.csv')) if r['iata_code'] and r['type'] in('large_airport','medium_airport','small_airport')]
byc=collections.defaultdict(list)
for r in air: byc[r['iso_country']].append(r)
rows=json.load(open('rows.json'))
res=[];country=city=None
for c in rows:
    if len(c)==5: country,city,ap,note=c[0],c[1],c[2],c[3]
    elif len(c)==4: city,ap,note=c[0],c[1],c[2]
    elif len(c)==3: ap,note=c[0],c[1]
    else: continue
    res.append((country.replace('<br />',' / '),city.replace('<br />',' / '),ap,note))
def st(n): return 'terminated' if re.search('erminated|closed',n) else 'suspended' if 'uspended' in n else 'future' if re.search('[Bb]egins|[Pp]lanned',n) else 'seasonal' if 'easonal' in n else 'cargo' if re.fullmatch(r'\s*Cargo\s*',n) else 'active'
toks=lambda s:set(norm(s).split())
GEN={'airport','international','intl'}
cat={};review=[]
OVR={'Milan Bergamo Airport':'BGY','Rome Fiumicino Airport':'FCO','EuroAirport Basel Mulhouse Freiburg':'BSL','Heathrow Airport':'LHR','Gatwick Airport':'LGW','Soekarno–Hatta International Airport':'CGK','Sabiha Gökçen International Airport':'SAW'}
for country,city,ap,note in res:
    s=st(note)
    if s not in('active','seasonal'): continue
    iso=None
    for part in re.split(r'\s*/\s*',country):
        iso=names.get(part) or alias.get(part)
        if iso: break
    if not iso: print('NO COUNTRY',country); continue
    byi={r['iata_code']:r for r in air}
    best=None;score=-1
    if ap in OVR and OVR[ap] in byi: best=byi[OVR[ap]];score=9
    else:
        ta=toks(ap);tc=toks(city.split('/')[0])
        for r in byc.get(iso,[]):
            tn=toks(r['name'])|toks(r['municipality'] or '')
            inter=len(ta&tn)
            if not inter: 
                if not(tc and tc<=tn): continue
            sc=inter/ max(1,len(ta))+ (0.5 if tc and tc<=tn else 0) + (0.3 if r['type']=='large_airport' else 0.15 if r['type']=='medium_airport' else 0) + (0.2 if r['scheduled_service']=='yes' else 0)
            if sc>score: score=sc;best=r
    if not best: print('MISS',iso,city,ap); continue
    if best['iata_code'] in cat: print('DUP',best['iata_code'],city,ap,'<-',cat[best['iata_code']]['name'])
    cat[best['iata_code']]=dict(iata=best['iata_code'],city=city,name=best['name'],iso=best['iso_country'],lat=round(float(best['latitude_deg']),3),lon=round(float(best['longitude_deg']),3),status=s)
    review.append((round(score,2),best['iata_code'],city,ap,best['name'],best['municipality']))
json.dump(cat,open('catalog.json','w'),ensure_ascii=False)
print(len(cat),len({v['iso'] for v in cat.values()}))

