#!/usr/bin/env python3
"""Construye el historial mensual compacto usado por el gráfico de valuación."""
import argparse
import json
from datetime import datetime
from pathlib import Path


MONTHS = {
    'enero': 1,
    'febrero': 2,
    'marzo': 3,
    'abril': 4,
    'mayo': 5,
    'junio': 6,
    'julio': 7,
    'agosto': 8,
    'septiembre': 9,
    'setiembre': 9,
    'octubre': 10,
    'noviembre': 11,
    'diciembre': 12,
}

LEGACY_ALL_USD_BRANDS = {'FERRARI', 'JAGUAR', 'LOTUS', 'MASERATI', 'MCLAREN', 'PORSCHE'}


def period_key(market):
    month_name = str(market.get('report_month', '')).strip().lower()
    month = MONTHS.get(month_name)
    year = int(market.get('report_year') or 0)
    if not month or year < 2000:
        raise ValueError('No se pudo determinar el período del historial de mercado.')
    return f'{year:04d}-{month:02d}'


def compact_price(price):
    amount = price.get('amount')
    if not isinstance(amount, (int, float)) or amount <= 0:
        return None
    if isinstance(amount, float) and amount.is_integer():
        amount = int(amount)
    return [amount, str(price.get('currency') or 'ARS').upper()]


def compact_period(market):
    rows = market.get('rows') or []
    if len(rows) < 5000:
        raise ValueError('El historial requiere una guía válida con al menos 5.000 filas.')

    compact_rows = []
    for row in rows:
        prices = {}
        for year, price in (row.get('prices') or {}).items():
            compact = compact_price(price or {})
            if compact:
                prices[str(year)] = compact

        # La base de agosto fue generada por el parser anterior. Su campo
        # values_usd contiene en realidad la cifra impresa por la guía: miles
        # de pesos para el mercado general y miles de US$ para seis marcas.
        # El 0 km legado se omite porque esa edición no conservó sus notas de
        # moneda con precisión suficiente para una comparación responsable.
        if not prices and row.get('values_usd'):
            premium = str(row.get('brand') or '').strip().upper() in LEGACY_ALL_USD_BRANDS
            currency = 'USD' if premium else 'ARS'
            for year, raw in row['values_usd'].items():
                if str(year) == '0km' or not isinstance(raw, (int, float)) or raw <= 0:
                    continue
                amount = raw * 1000
                if isinstance(amount, float) and amount.is_integer():
                    amount = int(amount)
                prices[str(year)] = [amount, currency]
        if prices:
            compact_rows.append([
                str(row.get('brand') or '').strip(),
                str(row.get('model') or '').strip(),
                str(row.get('variant') or '').strip(),
                prices,
            ])

    return {
        'key': period_key(market),
        'label': f"{str(market['report_month']).strip()} {int(market['report_year'])}",
        'source_file': market.get('source_file') or market.get('source') or '',
        'row_count': len(rows),
        'rows': compact_rows,
    }


def empty_history():
    return {'schema_version': 1, 'generated_at': '', 'periods': []}


def merge_history(history, market):
    result = dict(history or empty_history())
    result['schema_version'] = 1
    periods = {
        str(period.get('key')): period
        for period in (result.get('periods') or [])
        if period.get('key')
    }
    period = compact_period(market)
    periods[period['key']] = period
    result['periods'] = [periods[key] for key in sorted(periods)]
    result['generated_at'] = datetime.now().astimezone().isoformat(timespec='seconds')
    return result


def encode_history(history):
    return (json.dumps(history, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')


def main():
    parser = argparse.ArgumentParser(description='Combina guías mensuales JSON en un historial compacto.')
    parser.add_argument('sources', nargs='+', type=Path, help='vehicle_market.json de cada mes')
    parser.add_argument('-o', '--output', type=Path, required=True)
    args = parser.parse_args()

    history = empty_history()
    if args.output.exists():
        history = json.loads(args.output.read_text(encoding='utf-8'))

    for source in args.sources:
        market = json.loads(source.read_text(encoding='utf-8'))
        history = merge_history(history, market)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(encode_history(history))
    print('OK historial', ', '.join(period['label'] for period in history['periods']))
    print('Salida:', args.output)


if __name__ == '__main__':
    main()
