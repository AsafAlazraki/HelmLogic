#!/usr/bin/env python3
"""
Record the current theme's shipped work + pull in the on-theme story.

- Creates epic 'registration' (Registration & Compliance).
- Creates shipped v1.11 stories for: QLD rego catalogue, auto-match,
  band editor; fit-up expansion (packages/qty/override/note),
  fit-up workshop status + scheduling, variants/images/paired-with;
  end-to-end demo data pairing.
- Pulls 'Toggle detailed view for customer' from v1.16 -> v1.11.

Idempotent by stable doc ids. Default DRY-RUN; --apply to write.
"""
import requests, sys, time
PROJECT="studio-2290360004-3b963"; API_KEY="AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY"
BASE=f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
APPLY="--apply" in sys.argv
tok=requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",json={"returnSecureToken":True},timeout=15).json()["idToken"]
H={"Authorization":f"Bearer {tok}","Content-Type":"application/json"}
NOW={"timestampValue":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())}
def fs(v):
    if isinstance(v,bool): return {"booleanValue":v}
    if isinstance(v,int): return {"integerValue":str(v)}
    if isinstance(v,float): return {"doubleValue":v}
    if isinstance(v,str): return {"stringValue":v}
    if isinstance(v,list): return {"arrayValue":{"values":[fs(x) for x in v]}}
    if v is None: return {"nullValue":None}
def put(path,data,mask=None):
    if not APPLY: return "DRY"
    url=f"{BASE}/{path}"
    if mask: url+="?"+"&".join(f"updateMask.fieldPaths={m}" for m in mask)
    fields={k:(v if isinstance(v,dict) and (set(v.keys())&{'stringValue','integerValue','timestampValue','arrayValue','booleanValue','doubleValue','nullValue'}) else fs(v)) for k,v in data.items()}
    return requests.patch(url,headers=H,json={"fields":fields},timeout=20).status_code

# Epic
put("epics/registration",{
    "title":"Registration & Compliance","shortLabel":"REGO","color":"#0e7490",
    "description":"Boat + trailer registration (QLD MSQ/TMR), band-rule auto-association, and compliance fields on the quote.",
    "order":50,"status":"active","createdAt":NOW,"updatedAt":NOW})
print("epic registration")

def story(did,title,desc,epic,release="v1.11",status="shipped",pts=3,order=100):
    put(f"features/{did}",{
        "title":title,"description":desc,"type":"feature","status":status,
        "targetRelease":release,"priority":"high","points":pts,"epicId":epic,
        "order":order,"voteIds":[],"tags":["theme:e2e-quote"],"submitterId":None,
        "submitterName":"v1.11 theme build","acceptanceCriteria":[],
        "createdAt":NOW,"updatedAt":NOW})
    print(f"  story {did}: {title}")

story("reg-1-qld-catalogue","REG.1 — QLD registration catalogue (length + ATM bands)",
      "Queensland Transport (MSQ + TMR) Rego Authority with 5 boat hull-length bands and 4 trailer ATM bands, realistic indicative fees.","registration",pts=3,order=101)
story("reg-2-auto-match","REG.2 — Auto-match rego by boat length / trailer ATM",
      "RegoPicker auto-selects the matching band from the boat hull length (parsed from model code) and the trailer ATM. Large-scale association without per-boat config.","registration",pts=5,order=102)
story("reg-3-band-editor","REG.3 — Rego band editor + QLD rego module",
      "Rego module (moduleType 'rego') wired to the Highfield module; band-rule inputs (length for boat types, ATM for trailer types) in the Rego workspace editor.","registration",pts=3,order=103)

story("fitup-exp-1-packages","Fit-up — packages + per-line qty / override / note",
      "fitUpPackages collection, one-click bundle add with proportional package-price override, per-line quantity, per-quote price override + operator note.","fit-up-production",pts=5,order=110)
story("fitup-exp-2-workshop","Fit-up — workshop status + scheduling",
      "Orthogonal fitUpStatus (pending/scheduled/in-progress/complete) pill on the proposal header + scheduled date + assigned technician, audit-logged.","fit-up-production",pts=3,order=111)
story("fitup-exp-3-assoc","Fit-up — variant assignment + images + paired-with + catalog audit",
      "variantIds (sub-model) assignment, item images, soft oftenPairedWith hints, and an append-only catalog audit log.","fit-up-production",pts=3,order=112)

story("e2e-1-demo-pairing","E2E — Highfield boats paired for quoting (variants + motor HP + size-matched trailers)",
      "Filled 8 missing variants + 8 motor configs; size-matched Dunbier trailers to 63 rigid models (inflatables skipped); seeded dealer-fit + fit-up.","guided-configuration",pts=5,order=120)

# Pull 'Toggle detailed view for customer' into v1.11 (will be implemented now)
put("features/WD9kleQHRdBVxRQiQPBn",{"targetRelease":"v1.11","status":"in-progress","updatedAt":NOW},
    mask=["targetRelease","status","updatedAt"])
print("  pulled WD9kleQHRdBVxRQiQPBn 'Toggle detailed view for customer' -> v1.11 / in-progress")

print(f"\n{'WROTE' if APPLY else 'DRY-RUN'} roadmap theme records")
