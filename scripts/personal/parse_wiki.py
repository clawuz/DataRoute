import json,re,collections
t=json.load(open('wiki.json'))['parse']['wikitext']
i=t.find('==Destinations==')
body=t[i:]
j=body.find('\n|}')
body=body[:j]
rows=body.split('\n|-')[1:]
def clean(c):
    c=re.sub(r'<ref[^>]*?/>','',c)
    c=re.sub(r'<ref.*?</ref>','',c,flags=re.S)
    c=re.sub(r'\{\{[Tt]erminated\}\}','Terminated',c)
    c=re.sub(r'\{\{[Ss]uspended\}\}','Suspended',c)
    c=re.sub(r'\{\{[Ss]easonal\}\}','Seasonal',c)
    c=re.sub(r'\{\{[^}]*\}\}',lambda m:m.group(0)[2:-2],c)
    c=re.sub(r'\[\[([^\]|]*\|)?([^\]]*)\]\]',r'\2',c)
    c=re.sub(r'(rowspan|align|colspan|style)="?[^|]*"?\|','',c)
    c=re.sub(r"'''|''",'',c)
    return c.strip()
out=[];country=None;span=0
for r in rows:
    r=r.strip()
    if not r.startswith('|'): continue
    cells=[x for x in re.split(r'\|\|', r[1:])]
    cells=[clean(c) for c in cells]
    cells=[c for c in cells if True]
    out.append(cells)
print(len(out))
for c in out[:12]: print(c)
cnt=collections.Counter(len(c) for c in out);print(cnt)
json.dump(out,open('rows.json','w'))
