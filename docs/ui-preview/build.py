import json
COUNTS={'TR':53,'EU':108,'AM':30,'AF':60,'AS':97,'OC':3}
VERSIONS=[
 ("v1","v1-obsidian.html","Obsidian","Siyah zemin, tek kırmızı çizgi, büyük tipografi — küre sağ altta yarı gizli.","obsidian-lacquer-h57 + voltmark"),
 ("v2","v2-voyage.html","Voyage Glass","Ortalı sinematik hero, serif italik başlık, cam kartlar — küre ufuktan yükselir.","space-voyage-landing + astral-veil"),
 ("v3","v3-mission.html","Mission Control","Lacivert panel, adım rayı, mono etiketler — küre sağda ızgara altında.","azimuth-realty-engine + aperture-minimalist-dark"),
 ("v4","v4-boarding.html","Boarding Pass","Biniş kartı biçiminde kartlar, kırmızı şerit — küre tam ekran, buğulu.","lumen-aurora-vcard + crimson-mill card"),
]
BASE_CSS = r"""
@font-face{font-family:"TK Display";src:url(assets/fonts/TKDisplay-SemiBold.woff2) format("woff2");font-weight:600}
@font-face{font-family:"TK Display";src:url(assets/fonts/TKDisplay-Bold.woff2) format("woff2");font-weight:700}
@font-face{font-family:"TK Display Condensed";src:url(assets/fonts/TKDisplayCondensed-Bold.woff2) format("woff2");font-weight:700}
@font-face{font-family:"TK Text";src:url(assets/fonts/TKText-Regular.woff2) format("woff2");font-weight:400}
@font-face{font-family:"TK Text";src:url(assets/fonts/TKText-Medium.woff2) format("woff2");font-weight:500}
@font-face{font-family:"TK Text";src:url(assets/fonts/TKText-SemiBold.woff2) format("woff2");font-weight:600}
@font-face{font-family:"TK Text Wide";src:url(assets/fonts/TKTextWide-Regular.woff2) format("woff2");font-weight:400}
@font-face{font-family:"TK Text Wide";src:url(assets/fonts/TKTextWide-Medium.woff2) format("woff2");font-weight:500}
:root{--display:"TK Display",system-ui,sans-serif;--display-c:"TK Display Condensed","TK Display",system-ui,sans-serif;--text:"TK Text",system-ui,sans-serif;--wide:"TK Text Wide","TK Text",system-ui,sans-serif}
:root{--night:#02030A;--panel:#0A0F22;--ink:#F2F5FA;--dim:rgba(242,245,250,.62);--faint:rgba(242,245,250,.34);--line:rgba(242,245,250,.16);--red:#C90119;--red2:#E30A17;
--eu:#3FC8F2;--mea:#F7C548;--af:#7BD389;--as:#F2508F;--am:#A98BFF}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{background:var(--night);color:var(--ink);font:15px/1.5 var(--text);overflow:hidden;-webkit-font-smoothing:antialiased}
button{font:inherit;color:inherit;cursor:pointer}
.stage{position:fixed;inset:0;z-index:0;overflow:hidden}
.globe{position:absolute;background:url(assets/globe-night.jpg) center/cover no-repeat}
.veil{position:absolute;inset:0}
.bar{position:fixed;left:0;right:0;top:0;z-index:5;display:flex;align-items:center;gap:14px;padding:16px 28px}
.bar .lockup{height:34px;width:auto;display:block}.bar .sep{width:1px;height:26px;background:var(--line)}
.bar .tk{font-family:var(--wide);font-size:12px;letter-spacing:.2em}.bar .aw{font-family:var(--wide);font-size:11px;letter-spacing:.24em;color:var(--red2)}
.bar .sw{margin-left:auto;display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.bar .sw button{background:rgba(2,3,10,.55);border:1px solid var(--line);border-radius:99px;padding:5px 11px;font-size:12px;color:var(--dim);backdrop-filter:blur(6px)}
.bar .sw button.on{background:var(--ink);color:var(--night);border-color:var(--ink)}
main{position:fixed;inset:0;z-index:2;overflow:auto;padding:84px 28px 40px}
.screen{display:none;min-height:100%}.screen.on{display:flex;flex-direction:column}
.eyebrow{font-family:var(--wide);font-size:12px;letter-spacing:.26em;color:var(--red2);margin:0 0 10px}
h1{margin:0;font-family:var(--display);font-weight:700;letter-spacing:.005em;text-transform:uppercase}
.sub{color:var(--dim);margin:12px 0 0;max-width:52ch}
.mode{display:flex;text-align:left;border:1px solid var(--line);background:rgba(10,15,34,.62);border-radius:14px;padding:16px 18px;backdrop-filter:blur(8px)}
.mode:hover,.mode:focus-visible{border-color:var(--red2);outline:none}
.mode .n{color:var(--red2);font-size:12px;letter-spacing:.18em}
.mode b{font-family:var(--display);font-weight:700;font-size:21px;letter-spacing:.02em;text-transform:uppercase}.mode i{font-style:normal;color:var(--dim);font-size:13px}
.foot{font-family:var(--wide);margin:auto 0 0;padding-top:28px;font-size:12px;letter-spacing:.14em;color:var(--faint)}
.search{width:100%;max-width:560px;background:rgba(10,15,34,.7);border:1px solid var(--line);border-radius:12px;padding:12px 14px;color:var(--ink);font:inherit;backdrop-filter:blur(8px)}
.search:focus{outline:none;border-color:var(--red2)}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0}
.tab{background:rgba(10,15,34,.6);border:1px solid var(--line);border-radius:99px;padding:6px 12px;font-size:13px}
.tab .c{color:var(--dim);margin-left:6px}.tab.on{background:var(--ink);color:var(--night);border-color:var(--ink)}.tab.on .c{color:var(--night);opacity:.6}
.grp{font-family:var(--wide);font-size:12px;letter-spacing:.18em;margin:18px 0 8px}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{background:rgba(10,15,34,.62);border:1px solid var(--line);border-radius:99px;padding:7px 13px;font-size:14px;backdrop-filter:blur(6px)}
.chip small{color:var(--dim);margin-left:6px;font-size:11px;letter-spacing:.08em}
.chip.on{background:rgba(201,1,25,.28);border-color:var(--red2)}
.tray{position:sticky;bottom:0;margin-top:auto;display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:14px 0 0}
.tray .st{font-size:13px;color:var(--dim);flex:1;min-width:200px}
.cta{font-family:var(--wide);background:var(--red);border:0;border-radius:10px;padding:13px 22px;font-weight:600;letter-spacing:.12em;font-size:13px;color:#fff}
.ghost{font-family:var(--wide);background:transparent;border:1px solid var(--line);border-radius:10px;padding:12px 18px;font-size:13px;letter-spacing:.1em}
.stats{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
.stat{font:500 12px/1 var(--wide);background:rgba(10,15,34,.7);border:1px solid var(--line);border-radius:7px;padding:7px 9px;letter-spacing:.04em}
.box{background:rgba(10,15,34,.66);border:1px solid var(--line);border-radius:14px;padding:12px 14px;max-width:560px;backdrop-filter:blur(8px)}
.ribbon{height:76px;position:relative;margin-bottom:8px}
.ribbon i{position:absolute;height:4px;border-radius:2px}
.box .lab{font-size:12px;letter-spacing:.14em;color:var(--dim)}
.rows{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;margin-top:8px;font-size:13px}
.rows span{border-left:3px solid var(--as);padding-left:8px}
.sheet-back{position:fixed;inset:0;z-index:8;display:none;align-items:flex-end;justify-content:center;background:rgba(2,3,10,.62);backdrop-filter:blur(5px)}
.sheet-back.on{display:flex}
.sheet{width:min(520px,100%);background:#0A0F22;border:1px solid var(--line);border-radius:18px 18px 0 0;padding:20px;display:flex;flex-direction:column;gap:10px}
.sheet h3{margin:0 0 4px;text-align:center;font-family:var(--display);font-weight:700;letter-spacing:.1em;font-size:20px;text-transform:uppercase}
.opt{background:rgba(242,245,250,.05);border:1px solid var(--line);border-radius:12px;padding:14px 16px;text-align:left}
.opt:hover{border-color:var(--red2)}.opt b{display:block;font-family:var(--display);font-weight:700;letter-spacing:.08em;font-size:20px}.opt span{color:var(--dim);font-size:13px}
.linkbtn{background:none;border:0;color:var(--dim);font-size:12px;letter-spacing:.16em;padding:8px}
.origin-grid{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));max-width:900px}
.quick{display:inline-flex;gap:10px;align-items:center;margin:14px 0;background:rgba(201,1,25,.2);border:1px solid var(--red2);border-radius:99px;padding:9px 16px;font-size:14px}
@media (max-width:760px){main{padding:76px 16px 28px}.bar{padding:12px 16px}.bar .sw{display:none}}
"""
BASE_CSS += r"""
@media (max-width:760px){
 .globe{left:0!important;right:0!important;top:0!important;bottom:0!important;inset:0!important;width:auto!important;height:auto!important;transform:none!important;border-radius:0!important;opacity:.95!important;filter:none!important;background-size:cover!important;background-position:44% 42%!important}
 .veil{background:linear-gradient(180deg,rgba(2,3,10,.82) 0%,rgba(2,3,10,.35) 34%,rgba(2,3,10,.3) 62%,rgba(2,3,10,.88) 100%)!important}
 body.v1 #s-entry h1{font-size:36px}
 .mode b{font-size:21px!important}
}
"""
V_CSS = {
"v1": r"""
.globe{right:-18vw;bottom:-30vh;width:96vw;height:96vw;max-width:1500px;max-height:1500px;border-radius:50%;background-size:cover;background-position:center;opacity:.9;box-shadow:0 0 120px rgba(201,1,25,.25)}
.veil{background:linear-gradient(90deg,#02030A 8%,rgba(2,3,10,.72) 42%,rgba(2,3,10,0) 74%),linear-gradient(0deg,rgba(2,3,10,.5),transparent 40%)}
#s-entry{justify-content:center;max-width:720px;padding-left:2vw}
#s-entry h1{font-family:var(--display-c);font-size:clamp(34px,4.4vw,62px);line-height:.98;text-transform:uppercase;font-weight:700;letter-spacing:.005em}
#s-entry h1 em{font-style:normal;color:var(--red2)}
.hairline{width:56px;height:3px;background:var(--red);margin:16px 0}
.modes{display:flex;flex-direction:column;margin-top:20px;border-top:1px solid var(--line)}
.mode{border:0;border-bottom:1px solid var(--line);border-radius:0;background:transparent;backdrop-filter:none;padding:13px 4px;align-items:center;gap:18px}
.mode .n{width:30px}.mode b{flex:1;font-size:24px;letter-spacing:.04em;font-family:var(--display-c)}
.mode i{display:none}.mode .arr{color:var(--red2);transition:transform .2s}.mode:hover .arr{transform:translateX(6px)}
.mode:hover{border-color:var(--line);background:rgba(201,1,25,.08)}

.sheet-back{align-items:stretch;justify-content:flex-end;background:rgba(2,3,10,.55)}
.sheet{width:min(460px,100%);height:100%;border-radius:0;border:0;border-left:1px solid var(--line);background:rgba(2,3,10,.94);padding:92px 34px 34px;gap:0}
.sheet h3{text-align:left;font-size:54px;line-height:.98;margin:0}
.sheet .hairline{margin:18px 0 26px}
.opt{display:flex;align-items:center;gap:18px;background:transparent;border:0;border-top:1px solid var(--line);border-radius:0;padding:22px 0}
.opt:hover{background:rgba(201,1,25,.08)}
.opt .n{color:var(--red2);font-family:var(--wide);font-size:12px;letter-spacing:.18em;width:26px}
.opt .t{flex:1}.opt .t b{font-size:34px;line-height:1}.opt .t span{display:block;color:var(--dim);font-size:13px;margin-top:4px}
.opt em{font-style:normal;color:var(--red2)}
.sheet .x{position:absolute;right:26px;top:84px;background:none;border:0;color:var(--dim);font-size:18px}
""",
"v2": r"""
.globe{left:50%;bottom:-62vw;width:130vw;height:130vw;transform:translateX(-50%);border-radius:50%;box-shadow:0 -30px 140px rgba(63,200,242,.25),inset 0 0 120px rgba(2,3,10,.55)}
.veil{background:radial-gradient(ellipse at 50% 10%,rgba(2,3,10,.2),rgba(2,3,10,.8) 70%),linear-gradient(180deg,rgba(2,3,10,.55),transparent 30%)}
#s-entry{align-items:center;text-align:center;justify-content:center}
#s-entry h1{font-size:clamp(40px,5.2vw,76px);line-height:1}
#s-entry .sub{margin-left:auto;margin-right:auto}
.modes{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;width:min(900px,100%);margin-top:34px}
.mode{flex-direction:column;gap:8px;border-radius:20px;border:1px solid rgba(242,245,250,.22);background:linear-gradient(160deg,rgba(242,245,250,.12),rgba(242,245,250,.03));backdrop-filter:blur(16px);padding:20px;box-shadow:inset 0 1px 0 rgba(255,255,255,.18)}
.mode .arr{margin-top:auto;color:var(--dim)}
.bar .sw button{border-radius:99px}
.cta{border-radius:99px}

.sheet-back{align-items:center;background:rgba(2,3,10,.5)}
.sheet{width:min(660px,calc(100% - 32px));border-radius:28px;background:linear-gradient(160deg,rgba(242,245,250,.16),rgba(242,245,250,.04));backdrop-filter:blur(24px);border:1px solid rgba(242,245,250,.26);padding:28px;box-shadow:inset 0 1px 0 rgba(255,255,255,.2)}
.sheet h3{font-size:34px}
.tiles{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:8px}
.tile{border-radius:20px;padding:22px;display:flex;flex-direction:column;gap:6px;min-height:160px;background:rgba(242,245,250,.07)}
.tile .ico{width:44px;height:44px;border-radius:50%;background:var(--red);display:grid;place-items:center;margin-bottom:10px;font-size:16px}
.tile b{font-size:30px}
@media (max-width:760px){.tiles{grid-template-columns:1fr}.sheet-back{align-items:flex-end}.sheet{border-radius:28px 28px 0 0;width:100%}}
""",
"v3": r"""
.globe{right:-8vw;top:50%;width:70vw;height:70vw;transform:translateY(-50%);border-radius:50%;opacity:.7}
.veil{background:linear-gradient(90deg,#02030A 18%,rgba(2,3,10,.78) 48%,rgba(2,3,10,.2) 100%),repeating-linear-gradient(0deg,transparent 0 47px,rgba(242,245,250,.04) 47px 48px),repeating-linear-gradient(90deg,transparent 0 47px,rgba(242,245,250,.04) 47px 48px)}
#s-entry{justify-content:center;max-width:760px}
#s-entry h1{font-size:clamp(38px,5.4vw,72px);line-height:1.02}
.modes{display:grid;gap:10px;margin-top:26px}
.mode{border-radius:8px;background:rgba(10,15,34,.88);gap:16px;align-items:center}
.mode .n{font-family:var(--wide)}.mode i{display:block;margin-left:auto;font-family:var(--wide);font-size:11px}
.mode b{font-size:19px}.mode .arr{display:none}
.chip,.tab,.search,.box,.stat,.cta,.ghost{border-radius:6px}

.sheet-back{align-items:flex-end;justify-content:flex-end;background:transparent;backdrop-filter:none;pointer-events:none}
.sheet{pointer-events:auto;width:380px;margin:0 28px 28px 0;border-radius:6px;background:rgba(10,15,34,.97);padding:0;gap:0;border:1px solid var(--line);border-top:2px solid var(--red2)}
.hd{display:flex;justify-content:space-between;align-items:center;padding:6px 10px 6px 14px;font-family:var(--wide);font-size:11px;letter-spacing:.16em;color:var(--dim);border-bottom:1px solid var(--line)}
.row{display:grid;grid-template-columns:30px 1fr;gap:2px 12px;border-radius:0;border:0;border-bottom:1px solid var(--line);background:transparent;padding:14px}
.row b{font-size:24px}.row span{grid-column:2;font-size:12px}
kbd{font-family:var(--wide);border:1px solid var(--line);border-radius:4px;padding:2px 6px;font-size:11px;grid-row:span 2;align-self:start;color:var(--dim)}
@media (max-width:760px){.sheet{width:100%;margin:0;border-radius:6px 6px 0 0}}
""",
"v4": r"""
.globe{inset:-4%;opacity:.8;filter:saturate(1.1) blur(1px)}
.veil{background:radial-gradient(ellipse at 50% 48%,rgba(2,3,10,.1),rgba(2,3,10,.72) 82%),linear-gradient(180deg,rgba(2,3,10,.5),transparent 28%,transparent 70%,rgba(2,3,10,.6))}
#s-entry{align-items:center;justify-content:center;text-align:center}
#s-entry h1{font-size:clamp(40px,6vw,78px);line-height:1}
#s-entry .sub{margin-left:auto;margin-right:auto}
.modes{display:flex;flex-direction:column;gap:14px;margin-top:28px;width:min(640px,100%)}
.mode{position:relative;border:0;border-radius:14px;background:#F2F5FA;color:#02030A;padding:0;overflow:hidden;align-items:stretch;backdrop-filter:none}
.mode::before{content:"";width:14px;background:var(--red)}
.mode .body{display:flex;flex:1;align-items:center;gap:16px;padding:16px 18px;border-left:2px dashed rgba(2,3,10,.25);margin-left:2px;text-align:left}
.mode .n{color:var(--red);font-weight:600}.mode b{flex:1;font-size:18px}.mode i{color:rgba(2,3,10,.6);display:block;font-size:12px}
.mode .arr{color:var(--red)}
.mode:hover{outline:2px solid var(--red2);border-color:transparent}
.chip{background:#F2F5FA;color:#02030A;border-color:transparent}.chip small{color:rgba(2,3,10,.55)}
.chip.on{background:var(--red);color:#fff}.chip.on small{color:rgba(255,255,255,.75)}
.pass{display:flex;background:#F2F5FA;color:#02030A;border-radius:16px;overflow:hidden;max-width:640px}
.pass .st{width:16px;background:var(--red)}.pass .bd{padding:18px 20px;flex:1}
.pass .rt{font-family:var(--display);font-size:44px;font-weight:700;letter-spacing:.03em}.pass .rt span{color:var(--red)}
.pass .meta{display:flex;gap:18px;margin-top:10px;font-size:12px;letter-spacing:.1em;color:rgba(2,3,10,.65);flex-wrap:wrap}
.pass .meta b{display:block;color:#02030A;font-family:var(--display);font-size:20px;letter-spacing:.04em}
.pass .ds{width:110px;border-left:2px dashed rgba(2,3,10,.3);padding:14px;display:flex;flex-direction:column;justify-content:space-between;font-size:11px;letter-spacing:.14em}

.sheet{background:#F2F5FA;color:#02030A;border:0;border-radius:18px 18px 0 0;padding:0;overflow:hidden;gap:0;width:min(580px,100%);position:relative}
.sheet::before{content:"";position:absolute;left:0;top:0;bottom:0;width:14px;background:var(--red)}
.tk-head{padding:18px 20px 14px 34px;font-family:var(--wide);font-size:11px;letter-spacing:.2em;color:rgba(2,3,10,.6)}
.stub{margin-left:14px;display:flex;justify-content:space-between;align-items:center;gap:14px;background:transparent;border:0;border-top:2px dashed rgba(2,3,10,.25);border-radius:0;padding:18px 20px;color:#02030A}
.stub:hover{background:rgba(201,1,25,.07)}
.stub b{font-size:34px;line-height:1}.stub span{display:block;color:rgba(2,3,10,.62);font-size:13px;margin-top:2px}
.stub i{font-style:normal;font-family:var(--wide);font-size:11px;letter-spacing:.16em;border:1px solid rgba(2,3,10,.4);padding:5px 9px;border-radius:6px;white-space:nowrap}
.sheet .linkbtn{color:rgba(2,3,10,.6);margin-left:14px}
"""
}
FONTS = ""
def modes(v):
    items=[("01","Where I have been","Your journey, composed into one piece"),("02","Where I want to go","Your wishlist, as the music of a trip yet to come"),("03","The world, live","Every Turkish Airlines flight of the last 24 hours")]
    out=[]
    for n,b,i in items:
        if v=="v4":
            out.append(f'<button class="mode" data-go="origin"><div class="body"><span class="n">{n}</span><span style="flex:1"><b>{b}</b><i>{i}</i></span><span class="arr">→</span></div></button>')
        else:
            out.append(f'<button class="mode" data-go="origin"><span class="n">{n}</span><b>{b}</b><i>{i}</i><em class="arr" style="font-style:normal">→</em></button>')
    return "\n".join(out)
def chips(sel=()):
    data=[("ASIA",'#F2508F',[("Bali","DPS"),("Tokyo","NRT"),("Bangkok","BKK"),("Singapore","SIN"),("Jakarta","CGK"),("Seoul","ICN")]),("EUROPE",'#3FC8F2',[("Paris","CDG"),("Rome","FCO"),("Madrid","MAD"),("Athens","ATH"),("Vienna","VIE")]),("AMERICAS",'#A98BFF',[("New York","JFK"),("São Paulo","GRU"),("Mexico City","MEX")])]
    h=""
    for t,col,cs in data:
        h+=f'<div class="grp" style="color:{col}">{t} DESTINATIONS</div><div class="chips">'
        for n,c in cs:
            on=" on" if c in sel else ""
            h+=f'<button class="chip{on}">{n}<small>{c}</small></button>'
        h+='</div>'
    return h
TABS=f'<div class="tabs"><button class="tab on">All<span class="c">351</span></button><button class="tab">Türkiye<span class="c">{COUNTS["TR"]}</span></button><button class="tab">Europe<span class="c">{COUNTS["EU"]}</span></button><button class="tab">Americas<span class="c">{COUNTS["AM"]}</span></button><button class="tab">Africa<span class="c">{COUNTS["AF"]}</span></button><button class="tab">Asia<span class="c">{COUNTS["AS"]}</span></button><button class="tab">Australia<span class="c">{COUNTS["OC"]}</span></button></div>'

def sheet_html(v):
    if v=="v1":
        return """<div class="sheet-back" id="sheet"><aside class="sheet"><button class="x" id="closeSheet" aria-label="Close">✕</button><p class="eyebrow">SHARE</p><h3>Share<br>my piece</h3><div class="hairline"></div>
<button class="opt"><span class="n">01</span><span class="t"><b>VIDEO</b><span>15 seconds · 9:16 · Reels and Stories</span></span><em>→</em></button>
<button class="opt"><span class="n">02</span><span class="t"><b>CARD</b><span>Your globe and numbers · 9:16 · Stories</span></span><em>→</em></button>
<button class="opt"><span class="n">03</span><span class="t"><b>COPY LINK</b><span>worldofmusic-tk.web.app/?o=LHR&amp;v=DPS,JFK</span></span><em>→</em></button></aside></div>"""
    if v=="v2":
        return """<div class="sheet-back" id="sheet"><div class="sheet"><h3>Share my piece</h3>
<div class="tiles"><button class="opt tile"><span class="ico">▶</span><b>VIDEO</b><span>15 seconds · 9:16 · made for Reels and Stories</span></button>
<button class="opt tile"><span class="ico">▣</span><b>CARD</b><span>An image of your globe and numbers · 9:16 · for Stories</span></button></div>
<button class="linkbtn">COPY LINK</button><button class="linkbtn" id="closeSheet">CLOSE</button></div></div>"""
    if v=="v3":
        return """<div class="sheet-back" id="sheet"><div class="sheet"><div class="hd"><span>SHARE · 04 PIECE</span><button class="linkbtn" id="closeSheet">ESC</button></div>
<button class="opt row"><kbd>V</kbd><b>VIDEO</b><span>15 s · 9:16 · mp4 · Reels, Stories</span></button>
<button class="opt row"><kbd>C</kbd><b>CARD</b><span>Image · 9:16 · Stories</span></button>
<button class="opt row"><kbd>L</kbd><b>COPY LINK</b><span>worldofmusic-tk.web.app/?o=LHR&amp;v=DPS,JFK</span></button></div></div>"""
    return """<div class="sheet-back" id="sheet"><div class="sheet"><div class="tk-head"><img src="assets/tk-lockup-dark.png" alt="Turkish Airlines" style="height:22px;width:auto;display:block;margin-bottom:8px">A WORLD OF MUSIC · SHARE MY PIECE</div>
<button class="opt stub"><div><b>VIDEO</b><span>15 seconds · made for Reels and Stories</span></div><i>9:16 · MP4</i></button>
<button class="opt stub"><div><b>CARD</b><span>Your globe and numbers · for Stories</span></div><i>9:16 · PNG</i></button>
<button class="linkbtn">COPY LINK</button><button class="linkbtn" id="closeSheet">CLOSE</button></div></div>"""

def build(v,fname,title,desc,src):
    rail = ""
    result_top = ('<div class="pass"><div class="st"></div><div class="bd"><div style="display:flex;align-items:center;gap:12px"><img src="assets/tk-lockup-dark.png" alt="Turkish Airlines" style="height:24px;width:auto"><span style="font-size:11px;letter-spacing:.2em;color:rgba(2,3,10,.6)">A WORLD OF MUSIC · BOARDING PASS</span></div><div class="rt">LHR <span>→</span> IST <span>→</span> DPS</div><div class="meta"><div>PIECE<b>Wandering through Asia-Pacific</b></div><div>VOICE<b>Harp</b></div><div>TEMPO<b>84 BPM</b></div><div>DISTANCE<b>12,614 km</b></div></div></div><div class="ds"><span>SEAT</span><b style="font-size:20px">01A</b><span>355 · 133</span></div></div>'
                  if v=="v4" else
                  '<div class="eyebrow">YOUR PIECE</div><h1 style="font-size:clamp(28px,4vw,52px)">Wandering through Asia-Pacific</h1><div class="stats"><span class="stat">5 DESTINATIONS</span><span class="stat">5 COUNTRIES</span><span class="stat">41,667 KM</span><span class="stat">SIGNATURE · HARP</span></div>')
    html=f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title} — A World of Music</title>{FONTS}<style>{BASE_CSS}{V_CSS[v]}</style></head><body class="{v}">
<div class="stage"><div class="globe"></div><div class="veil"></div></div>
<header class="bar"><img class="lockup" src="assets/tk-lockup-light.png" alt="Turkish Airlines">
<div class="sw"><button data-go="entry" class="on">Giriş</button><button data-go="origin">Nereden</button><button data-go="dests">Nereye</button><button data-go="result">Sonuç</button><button data-go="share">Paylaş</button></div></header>
{rail}
<main>
<section id="s-entry" class="screen on">
<p class="eyebrow">A WORLD OF MUSIC</p>
<h1>Every journey has a sound.{' <em>Choose yours.</em>' if v=='v1' else '<br>Choose yours.'}</h1>
{'<div class="hairline"></div>' if v=='v1' else ''}
<p class="sub">Turn the places you have been, or the places you dream of, into a piece of music and share it.</p>
<div class="modes">{modes(v)}</div>
<p class="foot">TURKISH AIRLINES, FLYING TO MORE COUNTRIES THAN ANY OTHER AIRLINE IN THE WORLD · 355 DESTINATIONS · 133 COUNTRIES</p>
</section>
<section id="s-origin" class="screen">
<p class="eyebrow">STEP 1 OF 2</p><h1 style="font-size:clamp(26px,3.6vw,44px)">Where do you start from?</h1>
<p class="sub">Turkish Airlines connects 355 destinations in 133 countries through Istanbul. Pick the airport you fly out of.</p>
<div style="margin-top:18px"><input class="search" placeholder="Search a city, airport or country" value="lond"></div>
<button class="quick" data-go="dests"><span>🇹🇷</span> Istanbul — the hub itself <small style="color:var(--dim)">IST</small></button>
<div class="grp" style="color:var(--eu)">UNITED KINGDOM</div>
<div class="chips"><button class="chip on" data-go="dests">London<small>LHR</small></button><button class="chip" data-go="dests">London<small>LGW</small></button><button class="chip" data-go="dests">London<small>STN</small></button><button class="chip" data-go="dests">Manchester<small>MAN</small></button><button class="chip" data-go="dests">Edinburgh<small>EDI</small></button><button class="chip" data-go="dests">Birmingham<small>BHX</small></button></div>
</section>
<section id="s-dests" class="screen">
<p class="eyebrow">STEP 2 OF 2 · FROM LONDON VIA ISTANBUL</p><h1 style="font-size:clamp(26px,3.6vw,44px)">Where have you been?</h1>
<div style="margin-top:16px"><input class="search" placeholder="Search a city, airport or country"></div>
{TABS}
{chips(("DPS","JFK"))}
<div class="tray"><span class="st">2 selected · last: LHR → IST → DPS</span><button class="cta" data-go="result">COMPOSE MY JOURNEY</button></div>
</section>
<section id="s-result" class="screen">
{result_top}
<div class="box" style="margin-top:14px"><div class="ribbon"><i style="left:6%;top:30px;width:12%;background:var(--eu)"></i><i style="left:22%;top:14px;width:9%;background:var(--as)"></i><i style="left:40%;top:46px;width:16%;background:var(--am)"></i><i style="left:63%;top:24px;width:8%;background:var(--af)"></i><i style="left:78%;top:52px;width:12%;background:var(--mea)"></i><i style="left:58%;top:0;bottom:0;width:2px;background:#fff"></i></div>
<div class="lab">ROUTES → MUSIC · CHORUS · 84 BPM</div>
<div class="rows"><span>IST → DPS D3</span><span style="border-color:var(--eu)">LHR → IST D5</span><span style="border-color:var(--am)">IST → JFK C5</span></div></div>
<div class="tray" style="margin-top:20px"><span class="st"></span><button class="ghost">AI VERSION</button><button class="cta" data-go="share">SHARE MY PIECE</button></div>
</section>
</main>
{sheet_html(v)}
<script>
const screens={{entry:'s-entry',origin:'s-origin',dests:'s-dests',result:'s-result'}};
function go(k){{ if(k==='share'){{document.getElementById('sheet').classList.add('on');return}}
 document.getElementById('sheet').classList.remove('on');
 document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('on',s.id===screens[k]));
 document.querySelectorAll('[data-go]').forEach(b=>{{if(b.closest('.sw,.rail'))b.classList.toggle('on',b.dataset.go===k)}}); document.querySelector('main').scrollTop=0; }}
document.addEventListener('click',e=>{{const b=e.target.closest('[data-go]'); if(b){{go(b.dataset.go);return}}
 const c=e.target.closest('.chip'); if(c&&c.closest('#s-dests')) c.classList.toggle('on');
 const t=e.target.closest('.tab'); if(t){{t.parentElement.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));t.classList.add('on')}}
 if(e.target.id==='closeSheet'||e.target.id==='sheet') document.getElementById('sheet').classList.remove('on');}});
document.addEventListener('keydown',e=>{{if(e.key==='Escape')document.getElementById('sheet').classList.remove('on')}});
</script></body></html>'''
    open(fname,'w').write(html)
for v,f,t,d,s in VERSIONS: build(v,f,t,d,s)
# index
cards=''.join(f'<a class="c" href="{f}"><div class="t"><b>{t}</b><span>{v.upper()}</span></div><p>{d}</p><small>Kaynak yapı: {s}</small></a>' for v,f,t,d,s in VERSIONS)
open('versions.html','w').write(f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>4 alternatif — A World of Music</title>
<style>body{{margin:0;background:#02030A;color:#F2F5FA;font:15px/1.5 system-ui,sans-serif;padding:28px}}h1{{font-weight:600;margin:0 0 4px}}.g{{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));margin-top:18px}}
.c{{display:block;text-decoration:none;color:inherit;background:#0A0F22;border:1px solid rgba(242,245,250,.16);border-radius:14px;padding:18px}}.c:hover{{border-color:#E30A17}}.t{{display:flex;justify-content:space-between;align-items:baseline}}.t span{{color:#E30A17;font-size:12px;letter-spacing:.2em}}p{{color:rgba(242,245,250,.7);margin:8px 0}}small{{color:rgba(242,245,250,.45)}}</style></head><body>
<h1>4 alternatif görünüm</h1><p>Her biri 5 ekran: giriş, nereden, nereye, sonuç, paylaş. Üstteki düğmelerle ekranlar arasında gezin. Arkada bizim gece küremiz.</p><div class="g">{cards}</div></body></html>''')
print("built")
