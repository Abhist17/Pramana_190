"""Generates docs/architecture.svg. Kept as a script so the geometry stays exact
and the diagram can be regenerated when the system changes."""

W, H = 1480, 1000
P = []

C = dict(
    ink="#0f172a", mute="#64748b", faint="#94a3b8", line="#cbd5e1", pale="#e2e8f0",
    blue="#1d4ed8", blueBg="#eff6ff", blueLn="#bfdbfe",
    amber="#b45309", amberBg="#fffbeb", amberLn="#fcd34d",
    green="#047857", greenBg="#ecfdf5", greenLn="#a7f3d0",
    purple="#6d28d9", purpleBg="#f5f3ff", purpleLn="#ddd6fe",
    slate="#475569", slateBg="#f8fafc",
    red="#b91c1c",
)
F = "ui-sans-serif,system-ui,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
M = "ui-monospace,'SF Mono',Menlo,Consolas,monospace"

def esc(s): return s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")

def rect(x,y,w,h,fill,stroke,rx=8,sw=1.2,dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    P.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}/>')

def text(x,y,s,size=13,fill=C["ink"],weight=400,anchor="start",font=F,ls=0,op=1):
    P.append(f'<text x="{x}" y="{y}" font-family="{font}" font-size="{size}" fill="{fill}" '
             f'font-weight="{weight}" text-anchor="{anchor}" letter-spacing="{ls}" opacity="{op}">{esc(s)}</text>')

def band(x,y,w,label,color):
    """Section label bar."""
    text(x, y, label.upper(), size=11, fill=color, weight=700, ls=1.6)

def arrow(x1,y1,x2,y2,color=C["mute"],dash=None,width=1.6,head="arrow"):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    P.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{width}"{d} marker-end="url(#{head})"/>')

def chip(x,y,w,h,label,sub,fill,stroke,tc):
    rect(x,y,w,h,fill,stroke,rx=7)
    text(x+w/2, y+h/2-3 if sub else y+h/2+4, label, size=12.5, fill=tc, weight=650, anchor="middle")
    if sub: text(x+w/2, y+h/2+13, sub, size=10.5, fill=C["mute"], anchor="middle")

# ---------------------------------------------------------------- canvas ----
P.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="{F}">')
P.append(f'''<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="{C['mute']}"/></marker>
  <marker id="arrowP" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="{C['purple']}"/></marker>
</defs>''')
rect(0,0,W,H,"#ffffff","#ffffff",rx=0)

# ------------------------------------------------------------------ title ---
text(48, 52, "PRAMANA", size=27, weight=750, ls=3.5)
text(238, 52, "Secure evidence and document platform for the criminal justice system", size=14, fill=C["mute"])
text(48, 74, "SIH 2026 - PS 26190 - MHA / NCRB Women Safety Division", size=11.5, fill=C["faint"], font=M)
P.append(f'<line x1="48" y1="90" x2="{W-48}" y2="90" stroke="{C["pale"]}" stroke-width="1.5"/>')

LX, LW = 48, 792          # left (request path) column
RX, RW = 910, 522         # right (ledger) column

# =========================================================== LEFT COLUMN ====
band(LX, 120, LW, "clients", C["blue"])
cw = (LW - 24) / 3
for i,(t,s) in enumerate([("Officer console","case work, capture, audit"),
                          ("Public verifier","no login, no content"),
                          ("Citizen portal","case status by OTP")]):
    chip(LX + i*(cw+12), 134, cw, 54, t, s, C["blueBg"], C["blueLn"], C["blue"])

arrow(LX+LW/2, 192, LX+LW/2, 218)

# --- guard -------------------------------------------------------------------
band(LX, 236, LW, "zero-trust guard   -   single choke point for every request", C["amber"])
rect(LX, 250, LW, 82, C["amberBg"], C["amberLn"])
sw = (LW - 60) / 4
steps = [("1  Authenticate","token / DSC / device"),
         ("2  ABAC evaluate","17 rules, deny by default"),
         ("3  Audit record","allow AND deny"),
         ("4  Anomaly rescore","UEBA over the same stream")]
for i,(t,s) in enumerate(steps):
    x = LX + 14 + i*(sw+14)
    text(x, 278, t, size=12, weight=650, fill=C["amber"])
    text(x, 296, s, size=10.5, fill=C["mute"])
text(LX+14, 320, "No implicit access. No \"admin sees everything\". No role that can read a sealed document alone.",
     size=10.5, fill=C["amber"], op=.9)

arrow(LX+LW/2, 336, LX+LW/2, 362)

# --- services ----------------------------------------------------------------
band(LX, 380, LW, "application services", C["blue"])
rect(LX, 394, LW, 118, "#ffffff", C["line"])
svcs = ["documents","custody","audit","certificate","women safety","sealed cover",
        "retention","deadlines","search","extraction","redaction","anomaly"]
per, bw, bh = 6, (LW-14*2-5*10)/6, 30
for i,s in enumerate(svcs):
    r, c = divmod(i, per)
    x = LX + 14 + c*(bw+10); y = 410 + r*(bh+12)
    rect(x, y, bw, bh, C["blueBg"], C["blueLn"], rx=6)
    text(x+bw/2, y+19.5, s, size=11, fill=C["blue"], weight=600, anchor="middle")
text(LX+14, 500, "Sealing happens BEFORE storage: hash, encrypt, sign, anchor - in that order.",
     size=10.5, fill=C["mute"])

arrow(LX+LW/2, 516, LX+LW/2, 542)

# --- data plane --------------------------------------------------------------
band(LX, 560, LW, "data plane", C["green"])
dw = (LW - 24)/3
data = [("Encrypted object store","write-once - AES-256-GCM\nper-document key"),
        ("Metadata + index","SQLite / Postgres + RLS\nBM25 + dense vectors"),
        ("Derived namespace","OCR - entities - embeddings\nnever touches the original")]
for i,(t,s) in enumerate(data):
    x = LX + i*(dw+12)
    rect(x, 574, dw, 74, C["greenBg"], C["greenLn"])
    text(x+dw/2, 596, t, size=12, weight=650, fill=C["green"], anchor="middle")
    for j,ln in enumerate(s.split("\n")):
        text(x+dw/2, 614+j*14, ln, size=10.5, fill=C["mute"], anchor="middle")

# --- key hierarchy -----------------------------------------------------------
band(LX, 682, LW, "key hierarchy", C["green"])
rect(LX, 696, LW, 46, "#ffffff", C["line"])
kh = ["document data key","case key","master key (HSM in production)"]
kx = LX + 18
for i,k in enumerate(kh):
    text(kx, 725, k, size=11.5, fill=C["ink"], weight=600 if i==2 else 500, font=M)
    kx += len(k)*7.0 + 16
    if i < 2:
        text(kx-10, 725, "wrapped by", size=10, fill=C["faint"])
        kx += 74
text(LX+18, 712, "Compromise of one key exposes exactly one document.", size=10, fill=C["mute"])

# --- integration -------------------------------------------------------------
band(LX, 772, LW, "integration bus   -   interfaces defined, not yet wired", C["slate"])
rect(LX, 786, LW, 44, C["slateBg"], C["line"], dash="5 4")
ints = ["CCTNS","ICJS","eCourts","eSakshya","FSL LIMS","DigiLocker","SIEM"]
iw = (LW - 28 - 6*8)/7
for i,s in enumerate(ints):
    x = LX + 14 + i*(iw+8)
    rect(x, 796, iw, 24, "#ffffff", C["line"], rx=5)
    text(x+iw/2, 812, s, size=10.5, fill=C["slate"], weight=600, anchor="middle")

# ========================================================== RIGHT COLUMN ====
# The proof boundary
P.append(f'<line x1="{RX-38}" y1="112" x2="{RX-38}" y2="900" stroke="{C["purple"]}" stroke-width="1.6" stroke-dasharray="6 5" opacity=".55"/>')
P.append(f'<g transform="translate({RX-48},690) rotate(-90)">'
         f'<text x="0" y="0" text-anchor="middle" font-family="{F}" font-size="11.5" fill="{C["purple"]}" '
         f'font-weight="700" letter-spacing="1.4">PROOF CROSSES - CONTENT NEVER DOES</text></g>')

band(RX, 120, RW, "permissioned consortium ledger", C["purple"])
rect(RX, 134, RW, 300, C["purpleBg"], C["purpleLn"])
text(RX+16, 158, "Six contracts. Hashes, codes and counters only.", size=11.5, fill=C["purple"], weight=650)
contracts = [("DocumentRegistry","fingerprints, version chains"),
             ("CustodyLedger","transfers, documents + exhibits"),
             ("AuditAnchor","Merkle roots of audit batches"),
             ("AccessPolicyRegistry","policy hash + effective period"),
             ("SealedCustody","m-of-n unseal, waiting period"),
             ("RetentionRegistry","legal hold, destruction certs")]
for i,(t,s) in enumerate(contracts):
    y = 172 + i*42
    rect(RX+16, y, RW-32, 36, "#ffffff", C["purpleLn"], rx=6)
    text(RX+28, y+15, t, size=11.5, weight=650, fill=C["purple"], font=M)
    text(RX+28, y+29, s, size=10, fill=C["mute"])

band(RX, 458, RW, "validator set   -   institutions that do not report to one another", C["purple"])
rect(RX, 472, RW, 62, "#ffffff", C["purpleLn"])
vals = ["NCRB","State CID","Judiciary","FSL","Prosecution"]
vw = (RW - 32 - 4*7)/5
for i,v in enumerate(vals):
    x = RX + 16 + i*(vw+7)
    rect(x, 486, vw, 34, C["purpleBg"], C["purpleLn"], rx=6)
    text(x+vw/2, 507, v, size=10.5, fill=C["purple"], weight=650, anchor="middle")
text(RX+16, 530, "QBFT, 4-of-5 quorum. None can rewrite history alone.", size=10, fill=C["mute"])

# what goes on / never on chain
band(RX, 558, RW, "what crosses the boundary", C["purple"])
half = (RW-12)/2
rect(RX, 572, half, 150, C["greenBg"], C["greenLn"])
text(RX+14, 592, "ON CHAIN", size=11, weight=700, fill=C["green"], ls=1)
for i,s in enumerate(["document hash + algorithm","version pointers","custody events (pseudonymous)",
                      "Merkle root per audit batch","active policy hash","seal / unseal events",
                      "legal holds, destruction certs"]):
    text(RX+14, 610+i*15, "+  " + s, size=10, fill=C["ink"])
rect(RX+half+12, 572, half, 150, "#fef2f2", "#fecaca")
text(RX+half+26, 592, "NEVER ON CHAIN", size=11, weight=700, fill=C["red"], ls=1)
for i,s in enumerate(["document content, in any form","names, addresses, ID numbers","case narratives",
                      "anything content is inferable from","real officer identifiers"]):
    text(RX+half+26, 610+i*15, "x  " + s, size=10, fill=C["ink"])
text(RX+half+26, 700, "A guard rejects any such payload", size=9.5, fill=C["red"], weight=600)
text(RX+half+26, 712, "and throws. It is not overridable.", size=9.5, fill=C["red"], weight=600)

# scale note
band(RX, 748, RW, "why this scales", C["purple"])
rect(RX, 762, RW, 68, "#ffffff", C["line"])
text(RX+16, 782, "16,000 stations x millions of events a day cannot each be a transaction.", size=10.5, fill=C["ink"])
text(RX+16, 798, "Documents anchor individually. Audit events are Merkle-batched: one root", size=10.5, fill=C["mute"])
text(RX+16, 812, "per station per window, every event keeps a short inclusion proof.", size=10.5, fill=C["mute"])

# arrows across the boundary
for y, lbl in [(300, "anchor"), (455, "verify")]:
    arrow(LX+LW+8, y, RX-6, y, C["purple"], dash="4 4", head="arrowP")
    text((LX+LW+RX)/2, y-9, lbl, size=9.5, fill=C["purple"], anchor="middle", weight=650)

# ---------------------------------------------------------------- footer ----
P.append(f'<line x1="48" y1="900" x2="{W-48}" y2="900" stroke="{C["pale"]}" stroke-width="1.5"/>')
band(48, 928, W-96, "document lifecycle", C["ink"])
stages = ["CAPTURE","SEAL","CLASSIFY","STORE","USE","TRANSFER","PRODUCE","RETAIN","DISPOSE"]
notes  = ["field / scan","hash+sign+anchor","language, entities","encrypted, WORM","logged, watermarked",
          "signed both sides","court certificate","retention class","erasure + cert"]
sx, tw = 48, (W-96-8*9)/9
for i in range(9):
    x = sx + i*(tw+9)
    fill = C["amberBg"] if i == 1 else "#ffffff"
    stroke = C["amberLn"] if i == 1 else C["line"]
    rect(x, 944, tw, 38, fill, stroke, rx=6)
    text(x+tw/2, 960, stages[i], size=10.5, weight=700,
         fill=C["amber"] if i==1 else C["ink"], anchor="middle", ls=.4)
    text(x+tw/2, 973, notes[i], size=9, fill=C["mute"], anchor="middle")
    if i < 8:
        P.append(f'<text x="{x+tw+2}" y="{967}" font-size="12" fill="{C["faint"]}">&#8250;</text>')

P.append("</svg>")
open("docs/architecture.svg","w",encoding="utf-8").write("\n".join(P))
print("wrote docs/architecture.svg")
