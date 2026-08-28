#!/usr/bin/env python3
import json, re, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RULES_PATH = ROOT / "tools" / "normalization_rules.json"

def load_rules():
    return json.loads(RULES_PATH.read_text(encoding="utf-8"))

def norm(value=""):
    s = unicodedata.normalize("NFD", str(value)).encode("ascii", "ignore").decode().upper()
    s = s.replace("4 X 4","4X4").replace("4X 4","4X4").replace("4 X4","4X4")
    s = re.sub(r"(\d)\s*[,.]\s*(\d)", r"\1.\2", s)
    return re.sub(r"[^A-Z0-9.]+", " ", s).strip()

def canonical_tokens(value="", rules=None):
    rules = rules or load_rules()
    stop = set(rules.get("stop_tokens", []))
    aliases = rules.get("token_aliases", {})
    toks = []
    for token in norm(value).split():
        if token in stop:
            continue
        toks.append(aliases.get(token, token))

    out = []
    i = 0
    while i < len(toks):
        if i + 1 < len(toks) and re.fullmatch(r"[2345]", toks[i]) and toks[i+1] == "P":
            out.append(toks[i] + "P")
            i += 2
            continue
        if i + 1 < len(toks) and re.fullmatch(r"\d{1,2}", toks[i]) and toks[i+1] == "V":
            out.append(toks[i] + "V")
            i += 2
            continue
        out.append(toks[i])
        i += 1
    return out

def model_compact(value=""):
    return re.sub(r"[^A-Z0-9]+", "", norm(value))

def canonical_variant(value="", rules=None):
    return " ".join(canonical_tokens(value, rules=rules))

def unordered_signature(value="", rules=None):
    return tuple(sorted(canonical_tokens(value, rules=rules)))
