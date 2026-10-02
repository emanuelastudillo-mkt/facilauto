#!/usr/bin/env python3
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
market=json.load(open(ROOT/'data/vehicle_market.json',encoding='utf-8'))
dnrpa=json.load(open(ROOT/'data/dnrpa.json',encoding='utf-8'))
rates=json.load(open(ROOT/'data/rates.json',encoding='utf-8'))
catalog=json.load(open(ROOT/'data/unified_catalog.json',encoding='utf-8'))
config=json.load(open(ROOT/'data/config.json',encoding='utf-8'))
history=json.load(open(ROOT/'data/vehicle_history.json',encoding='utf-8'))
site_meta=json.load(open(ROOT/'data/site_meta.json',encoding='utf-8'))
assert len(market['rows'])>5000
assert len(dnrpa['rows'])>10000
assert len(rates['products'])>=10
assert len(catalog['entries'])>len(market['rows'])
assert config['version']=='0.09'
assert config['opportunity']['market_offset_percent']==10
assert history['schema_version']==1
assert len(history['periods'])>=2
assert history['periods']==sorted(history['periods'],key=lambda p:p['key'])
assert all(len(period['rows'])>5000 for period in history['periods'])
assert 'market_pulse' not in site_meta
assert site_meta['home_pulse']['period']==history['periods'][-1]['label']
assert len(site_meta['home_pulse']['metrics'])==3
assert site_meta['home_pulse']['metrics'][0]['value']==catalog['stats']['public_entries']
assert site_meta['home_pulse']['metrics'][1]['value']>10000
assert 0 <= site_meta['home_pulse']['metrics'][2]['value'] <= 100
# Toda fila de ambas fuentes debe quedar seleccionable en el catálogo, fusionada o individual.
market_ids={x for e in catalog['entries'] for x in e.get('market_ids',[])}
dnrpa_ids={x for e in catalog['entries'] for x in e.get('dnrpa_ids',[])}
assert {r['id'] for r in market['rows']} <= market_ids
dnrpa_with_values={
    r['id'] for r in dnrpa['rows']
    if any(str(y).isdigit() and isinstance(v,(int,float)) and v>0
           for y,v in (r.get('values_ars') or {}).items())
}
assert dnrpa_with_values <= dnrpa_ids
assert all(e.get('years') for e in catalog['entries'])
public_entries=[e for e in catalog['entries'] if e.get('public')]
assert catalog['stats']['public_entries']==len(public_entries)
assert catalog['stats']['public_brands']==len({e['brand'] for e in public_entries})
assert all(e.get('public') is True for e in catalog['entries'] if e.get('market_ids'))
# El catálogo completo se conserva, pero motos y pesados no llegan al selector público.
dnrpa_by_id={r['id']:r for r in dnrpa['rows']}
assert any(e.get('public') is False and e.get('dnrpa_ids') for e in catalog['entries'])
assert not any(
    e.get('public') and e.get('source')=='dnrpa'
    and any(str(dnrpa_by_id[did].get('code','')).strip().endswith(' M') for did in e.get('dnrpa_ids',[]))
    for e in catalog['entries']
)
assert not any(
    len(e.get('years',[])) == 46
    and e['years'][0] == '2026'
    and e['years'][-1] == '1981'
    for e in catalog['entries']
)
# Un modelo ausente en la guía mensual pero presente en DNRPA debe aparecer.
assert any(e['brand']=='CHEVROLET' and e['model']=='ASTRA' and e['source']=='dnrpa' for e in catalog['entries'])
# Un modelo presente en ambas fuentes debe mantener las versiones de mercado y sumar DNRPA.
assert any(e['brand']=='CHEVROLET' and e['model']=='ONIX' and e.get('market_ids') for e in catalog['entries'])
assert any(e['brand']=='CHEVROLET' and e['model']=='ONIX' and e.get('dnrpa_ids') for e in catalog['entries'])
# Los huecos internos de año se completan para permitir interpolación.
assert any('2018' in e['years'] and '2019' in e['years'] and e['brand']=='AGRALE' and e['model']=='MARRUA' and 'AM 200' in e['variant'] for e in catalog['entries'])
print('OK smoke test',len(catalog['entries']),'catalog entries',len(market['rows']),'market',len(dnrpa['rows']),'dnrpa')
