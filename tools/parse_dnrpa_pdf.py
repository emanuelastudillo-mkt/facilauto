#!/usr/bin/env python3
import argparse, json, re
from pathlib import Path
from datetime import datetime, timezone
import pypdfium2 as pdfium

YEARS=['0km']+[str(y) for y in range(2025,2001,-1)]

def page_rows(page):
    textpage=page.get_textpage()
    text=textpage.get_text_range()
    offset=0
    rows=[]
    for line in text.splitlines(keepends=True):
        words=[]
        for match in re.finditer(r'\S+',line):
            start=offset+match.start();end=offset+match.end()-1
            first=textpage.get_charbox(start);last=textpage.get_charbox(end)
            x0=min(first[0],last[0]);x1=max(first[2],last[2])
            words.append((x0,x1,0.0,match.group()))
        offset+=len(line)
        if words:rows.append(words)
    return rows

def parse_pdf(pdf_path, identity_by_code=None):
    identity_by_code=identity_by_code or {}
    cols={}; out=[]; vigencia=''; page_no=0
    pdf=pdfium.PdfDocument(pdf_path)
    try:
        for page_no,page in enumerate(pdf,start=1):
            for row in page_rows(page):
                line=' '.join(w[3] for w in row)
                if not vigencia and 'Vigencia' in line:
                    m=re.search(r'(\d{2}/\d{2}/\d{4})',line)
                    if m:vigencia=m.group(1)
                if not cols and '0Km' in line and '2025' in line and 'Desc.' in line:
                    for x0,x1,_,t in row:
                        key='0km' if t=='0Km' else (t if t in YEARS else None)
                        if key:cols[key]=(x0+x1)/2
                    continue
                if not row or row[0][3] not in {'I','N'} or row[0][0]>23 or not cols:
                    continue
                def tr(a,b):return ' '.join(t for x0,x1,_,t in row if a<=x0<b).strip()
                code=tr(25,55);brand=tr(95,130);model=tr(130,180);body=tr(180,231)
                if not brand or not model:continue
                identity=identity_by_code.get(code)
                if identity:
                    brand=identity.get('brand',brand)
                    model=identity.get('model',model)
                    body=identity.get('body_type',body)
                vals={}
                for x0,x1,_,t in row:
                    if not re.fullmatch(r'\d+',t):continue
                    c=(x0+x1)/2;k=min(cols,key=lambda z:abs(cols[z]-c))
                    if abs(cols[k]-c)<=12:vals[k]=int(t)
                out.append({'id':f'dnrpa-{len(out)+1}','code':code,'brand':brand,'model':model,'body_type':body,'values_ars':vals,'page':page_no})
    finally:
        pdf.close()
    return {'source':'DNRPA - Tabla de valuación de automotores','source_url':'https://www.dnrpa.gov.ar/valuacion/valuaciones.php','source_file':Path(pdf_path).name,'valid_from':vigencia,'generated_at':datetime.now(timezone.utc).isoformat(timespec='seconds'),'currency':'ARS','rows':out}

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('pdf');ap.add_argument('-o','--output',default='data/dnrpa.json');ap.add_argument('--identity-base');args=ap.parse_args()
    out=Path(args.output)
    identity_path=Path(args.identity_base) if args.identity_base else out
    identity_by_code={}
    if identity_path.exists():
        previous=json.loads(identity_path.read_text(encoding='utf-8'))
        identity_by_code={r['code']:r for r in previous.get('rows',[]) if r.get('code')}
    d=parse_pdf(args.pdf,identity_by_code);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')),encoding='utf-8');print(f"OK: {len(d['rows'])} registros -> {out}")
