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
    parser.add_argument('--pulse-month', help='Mes del pulso, por ejemplo Agosto')
    parser.add_argument('--pulse-year', type=int)
    parser.add_argument('--pulse-monthly', type=int, help='Operaciones del mes')
    parser.add_argument('--pulse-ytd', type=int, help='Operaciones acumuladas del año')
    parser.add_argument('--pulse-leader', type=int, help='Operaciones del Gol / Trend')
    parser.add_argument('--pulse-source-url')
    parser.add_argument('--ranking-source-url')
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


def update_meta(meta, market, dnrpa, args):
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

    pulse_values = [args.pulse_month, args.pulse_year, args.pulse_monthly, args.pulse_ytd, args.pulse_leader]
    if any(value is not None for value in pulse_values):
        if not all(value is not None for value in pulse_values):
            raise ValueError('Para actualizar el pulso indicá mes, año, mensual, acumulado y líder.')
        pulse = meta.setdefault('market_pulse', {})
        pulse.update({
            'period': f'{args.pulse_month} {args.pulse_year}',
            'country_label': 'Argentina · vehículos usados',
            'monthly_transactions': args.pulse_monthly,
            'monthly_caption': f'usados comercializados en {args.pulse_month.lower()}',
            'year_to_date': args.pulse_ytd,
            'year_to_date_label': f'Acumulado {args.pulse_year}',
            'year_to_date_caption': f'operaciones entre enero y {args.pulse_month.lower()}',
            'leader_transactions': args.pulse_leader,
            'leader_caption': 'Gol / Trend · líder usado del mes',
            'verified_at': datetime.now().astimezone().date().isoformat()
        })
        if args.pulse_source_url:
            pulse['source_url'] = args.pulse_source_url
        if args.ranking_source_url:
            pulse['ranking_source_url'] = args.ranking_source_url
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
            meta = update_meta(read_json(SITE_META), market_data, dnrpa_data, args)
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
