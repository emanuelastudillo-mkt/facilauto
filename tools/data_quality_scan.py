#!/usr/bin/env python3
"""
FACIL AUTO — escáner privado de calidad de datos.

Lee data/unified_catalog.json pero escribe TODO el resultado dentro de
private-data-quality/, carpeta ignorada por Git.

No modifica datos ni fusiona registros.
"""
import csv, json, collections, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from vehicle_normalization import norm, canonical_tokens, model_compact, unordered_signature

CATALOG = ROOT / "data" / "unified_catalog.json"
OUT = ROOT / "private-data-quality"

def write_csv(path, fields, rows):
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for row in rows:
            w.writerow(row)

def main():
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    entries = data.get("entries", [])
    OUT.mkdir(parents=True, exist_ok=True)

    exact = collections.defaultdict(list)
    unordered = collections.defaultdict(list)
    models = collections.defaultdict(list)

    for e in entries:
        brand = norm(e.get("brand",""))
        model = norm(e.get("model",""))
        exact[(brand, model, " ".join(canonical_tokens(e.get("variant",""))))].append(e)
        unordered[(brand, model, unordered_signature(e.get("variant","")))].append(e)
        models[(brand, model_compact(e.get("model","")))].append(e)

    exact_groups = [g for g in exact.values() if len(g) > 1]
    unordered_groups = [g for g in unordered.values() if len(g) > 1]

    exact_rows = []
    for n, group in enumerate(exact_groups, 1):
        for e in group:
            exact_rows.append({
                "group":n,
                "brand":e.get("brand",""),
                "model":e.get("model",""),
                "variant":e.get("variant",""),
                "years":",".join(e.get("years",[])),
                "source":e.get("source",""),
                "id":e.get("id","")
            })

    unordered_rows = []
    for n, group in enumerate(unordered_groups, 1):
        for e in group:
            unordered_rows.append({
                "group":n,
                "brand":e.get("brand",""),
                "model":e.get("model",""),
                "variant":e.get("variant",""),
                "years":",".join(e.get("years",[])),
                "source":e.get("source",""),
                "id":e.get("id","")
            })

    model_rows = []
    group_no = 0
    for (_, compact), group in sorted(models.items(), key=lambda x:(x[0][0],x[0][1])):
        names = sorted(set(str(e.get("model","")) for e in group))
        if len(names) <= 1:
            continue
        group_no += 1
        model_rows.append({
            "group":group_no,
            "brand":group[0].get("brand",""),
            "canonical_candidate":compact,
            "model_names":" | ".join(names),
            "records":len(group)
        })

    write_csv(OUT/"duplicados-exactos.csv",
              ["group","brand","model","variant","years","source","id"], exact_rows)
    write_csv(OUT/"duplicados-mismos-tokens.csv",
              ["group","brand","model","variant","years","source","id"], unordered_rows)
    write_csv(OUT/"alias-modelos.csv",
              ["group","brand","canonical_candidate","model_names","records"], model_rows)

    summary = {
        "entries":len(entries),
        "exact_duplicate_groups":len(exact_groups),
        "same_token_groups":len(unordered_groups),
        "model_alias_groups":len(model_rows)
    }
    (OUT/"resumen.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False),
        encoding="utf-8"
    )
    print("OK", json.dumps(summary, ensure_ascii=False))
    print("Salida privada:", OUT)

if __name__ == "__main__":
    main()
