#!/usr/bin/env python3
"""Actualiza FACIL AUTO a partir de los dos PDF mensuales y valida el resultado."""
import argparse
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

from build_vehicle_history import empty_history, encode_history, merge_history

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
MARKET = DATA / 'vehicle_market.json'
DNRPA = DATA / 'dnrpa.json'
CATALOG = DATA / 'unified_catalog.json'
SITE_META = DATA / 'site_meta.json'
HISTORY = DATA / 'vehicle_history.json'


def run(*parts):
    subprocess.run([sys.executable, *map(str, parts)], cwd=ROOT, check=True)


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def atomic_bytes(path, payload):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + '.monthly-tmp')
    temporary.write_bytes(payload)
    os.replace(temporary, path)


def atomic_json(path, value):
    atomic_bytes(path, (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))


def parse_args():
    parser = argparse.ArgumentParser(
        description='Procesa el PDF de precios y el PDF DNRPA, regenera el catálogo y ejecuta QA.'
    )
    parser.add_argument('market_pdf', type=Path, help='PDF mensual de autos, pick-ups y utilitarios')
    parser.add_argument('dnrpa_pdf', type=Path, help='PDF vigente de valuaciones DNRPA')
    parser.add_argument('--version', help='Versión pública del sitio, por ejemplo 1.6.1')
    return parser.parse_args()


def validate_parsed(market, dnrpa):
    if len(market.get('rows', [])) < 5000:
        raise ValueError('El PDF de mercado produjo menos de 5.000 referencias; se cancela la actualización.')
    if len(dnrpa.get('rows', [])) < 10000:
        raise ValueError('El PDF DNRPA produjo menos de 10.000 filas; se cancela la actualización.')
    if not market.get('report_month') or not market.get('report_year'):
        raise ValueError('No se pudo determinar el período del PDF de mercado.')
    if not dnrpa.get('valid_from'):
        raise ValueError('No se pudo determinar la vigencia del PDF DNRPA.')


def period_price_map(period):
    prices = {}
    for brand, model, variant, years in period.get('rows', []):
        for year, price in years.items():
            if not isinstance(price, list) or len(price) < 2:
                continue
            amount, currency = price[:2]
            if isinstance(amount, (int, float)) and amount > 0:
                key = (brand, model, variant, str(year), str(currency).upper())
                prices[key] = amount
    return prices


def build_home_pulse(history, catalog, market):
    periods = sorted(history.get('periods') or [], key=lambda period: period.get('key', ''))
    if len(periods) < 2:
        raise ValueError('El pulso de valuaciones requiere al menos dos meses de historial.')

    previous, current = periods[-2:]
    previous_prices = period_price_map(previous)
    current_prices = period_price_map(current)
    comparable = [
        (previous_prices[key], amount)
        for key, amount in current_prices.items()
        if key in previous_prices
    ]
    if not comparable:
        raise ValueError('No se encontraron precios comparables para el pulso de valuaciones.')

    unchanged = sum(1 for before, after in comparable if before == after)
    stable_percent = round(unchanged * 100 / len(comparable), 1)
    public_entries = int(catalog.get('stats', {}).get('public_entries') or 0)
    if public_entries <= 0:
        raise ValueError('El catálogo no informó referencias públicas para el pulso de valuaciones.')

    previous_label = str(previous.get('label') or '').strip()
    current_label = str(current.get('label') or '').strip()
    previous_month = previous_label.rsplit(' ', 1)[0].lower()
    current_month = current_label.rsplit(' ', 1)[0].lower()
    comparable_label = f'{len(comparable):,}'.replace(',', '.')
    return {
        'title': 'Pulso de valuaciones',
        'period': current_label,
        'subtitle': 'Base FACIL AUTO · vehículos usados',
        'metrics': [
            {
                'label': 'Cobertura actual',
                'value': public_entries,
                'format': 'number',
                'caption': 'vehículos y versiones disponibles para cotizar',
            },
            {
                'label': 'Comparación mensual',
                'value': len(comparable),
                'format': 'number',
                'caption': f'precios comparables entre {previous_month} y {current_month}',
            },
            {
                'label': 'Estabilidad de valores',
                'value': stable_percent,
                'format': 'percent',
                'decimals': 1,
                'caption': f'sin cambios frente a {previous_month}',
            },
        ],
        'note': (
            f'Análisis propio sobre la guía de {current_month}, el catálogo público '
            f'y {comparable_label} precios equivalentes del historial.'
        ),
        'generated_at': datetime.now().astimezone().isoformat(timespec='seconds'),
        'market_rows': len(market.get('rows') or []),
    }


def update_meta(meta, market, dnrpa, catalog, history, args):
    month = str(market['report_month']).strip()
    year = int(market['report_year'])
    meta.setdefault('release', {})['updated_at'] = datetime.now().astimezone().date().isoformat()
    meta['release']['label'] = f'Datos {month.lower()} {year}'
    if args.version:
        meta['release']['version'] = args.version.lstrip('v')
    meta['valuation_data'] = {
        'market_period': f'{month} {year}',
        'dnrpa_valid_from': dnrpa['valid_from']
    }

    meta.pop('market_pulse', None)
    meta['home_pulse'] = build_home_pulse(history, catalog, market)
    return meta


def main():
    args = parse_args()
    for source in (args.market_pdf, args.dnrpa_pdf):
        if not source.is_file():
            raise FileNotFoundError(source)

    with tempfile.TemporaryDirectory(prefix='facilauto-monthly-') as tmp_name:
        tmp = Path(tmp_name)
        parsed_market = tmp / 'vehicle_market.json'
        parsed_dnrpa = tmp / 'dnrpa.json'
        run(ROOT / 'tools' / 'parse_market_pdf.py', args.market_pdf.resolve(), '-o', parsed_market)
        run(
            ROOT / 'tools' / 'parse_dnrpa_pdf.py', args.dnrpa_pdf.resolve(),
            '-o', parsed_dnrpa, '--identity-base', DNRPA
        )
        market_data = read_json(parsed_market)
        dnrpa_data = read_json(parsed_dnrpa)
        validate_parsed(market_data, dnrpa_data)

        targets = (MARKET, DNRPA, CATALOG, SITE_META, HISTORY)
        backups = {path: path.read_bytes() if path.exists() else None for path in targets}
        try:
            history = read_json(HISTORY) if HISTORY.exists() else empty_history()
            history = merge_history(history, read_json(MARKET))
            history = merge_history(history, market_data)
            atomic_bytes(MARKET, parsed_market.read_bytes())
            atomic_bytes(DNRPA, parsed_dnrpa.read_bytes())
            run(ROOT / 'tools' / 'build_unified_catalog.py')
            catalog_data = read_json(CATALOG)
            meta = update_meta(
                read_json(SITE_META), market_data, dnrpa_data, catalog_data, history, args
            )
            atomic_json(SITE_META, meta)
            atomic_bytes(HISTORY, encode_history(history))
            run(ROOT / 'tools' / 'smoke_test.py')
            run(ROOT / 'tools' / 'data_quality_scan.py')
        except Exception:
            for path, payload in backups.items():
                if payload is not None:
                    atomic_bytes(path, payload)
            raise

    catalog = read_json(CATALOG)
    print('ACTUALIZACIÓN MENSUAL OK')
    print(f"Mercado: {market_data['report_month']} {market_data['report_year']} · {len(market_data['rows']):,} filas")
    print(f"DNRPA: {dnrpa_data['valid_from']} · {len(dnrpa_data['rows']):,} filas")
    print(f"Catálogo: {catalog['stats']['entries']:,} internas · {catalog['stats']['public_entries']:,} públicas")
    print('Archivos para GitHub: data/vehicle_market.json, data/dnrpa.json, data/unified_catalog.json, data/site_meta.json, data/vehicle_history.json')


if __name__ == '__main__':
    main()
