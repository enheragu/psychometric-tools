#!/usr/bin/env python3
"""Update country data CSVs from Our World in Data.

Currently fetched indicators:
- Human Development Index  → data/hdi.csv
- World Bank income groups → data/income_groups.csv

For each indicator, the latest available year per ISO-3 country code is kept.
A combined data/metadata.json is written. Aliases (data/country_aliases.json)
are rebuilt from the union of countries seen across all indicators.

Usage:
  python3 scripts/update_country_data.py
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import pathlib
import urllib.error
import urllib.request
from functools import partial

HDI_SOURCE = "https://ourworldindata.org/grapher/human-development-index.csv"
INCOME_SOURCE = "https://ourworldindata.org/grapher/world-bank-income-groups.csv"

DEFAULT_COUNTRY_NAMES_SOURCE = (
    "https://restcountries.com/v3.1/all?fields=cca2,cca3,name,translations"
)

DATA_DIR_DEFAULT = pathlib.Path(__file__).resolve().parent.parent / "data"

# Canonical income group keys + display labels.
INCOME_GROUP_KEYS = {
    "low income": "low",
    "low-income countries": "low",
    "lower middle income": "lower_middle",
    "lower-middle income": "lower_middle",
    "lower-middle-income countries": "lower_middle",
    "upper middle income": "upper_middle",
    "upper-middle income": "upper_middle",
    "upper-middle-income countries": "upper_middle",
    "high income": "high",
    "high-income countries": "high",
}
INCOME_GROUP_ORDER = ["low", "lower_middle", "upper_middle", "high"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Update country data CSVs from OWID")
    parser.add_argument("--data-dir", default=str(DATA_DIR_DEFAULT), help="Output data directory")
    parser.add_argument("--hdi-source", default=HDI_SOURCE)
    parser.add_argument("--income-source", default=INCOME_SOURCE)
    return parser.parse_args()


# ── HTTP helpers ─────────────────────────────────────────────────────────

def _http_get(url: str, accept: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
            "Accept": accept,
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def download_csv(url: str) -> str:
    return _http_get(url, "text/csv,*/*;q=0.8").decode("utf-8")


def download_json(url: str) -> object:
    return json.loads(_http_get(url, "application/json,*/*;q=0.8").decode("utf-8"))


# ── Generic latest-year-per-iso reducer ──────────────────────────────────

def _iter_owid_rows(raw_csv: str, value_columns: list[str]):
    """Yield (iso3, country, year, raw_value) tuples from an OWID grapher CSV.

    The first column found from `value_columns` is used as the indicator value.
    """
    reader = csv.DictReader(io.StringIO(raw_csv))

    value_col = None
    for col in value_columns:
        if reader.fieldnames and col in reader.fieldnames:
            value_col = col
            break
    if value_col is None:
        raise ValueError(
            f"None of the expected value columns {value_columns} present in CSV header {reader.fieldnames}"
        )

    for row in reader:
        iso3 = (row.get("Code") or "").strip()
        country = (row.get("Entity") or "").strip()
        raw_value = row.get(value_col)
        year_raw = row.get("Year")

        if not iso3 or len(iso3) != 3 or iso3.startswith("OWID_"):
            continue
        if not country or raw_value is None or str(raw_value).strip() == "":
            continue

        try:
            year = int(float(str(year_raw)))
        except (TypeError, ValueError):
            continue

        yield iso3, country, year, str(raw_value).strip()


def latest_hdi_rows(raw_csv: str) -> list[dict[str, str]]:
    latest: dict[str, tuple[int, dict[str, str]]] = {}

    for iso3, country, year, raw_value in _iter_owid_rows(
        raw_csv, ["Human Development Index"]
    ):
        try:
            value = float(raw_value)
        except ValueError:
            continue
        if not (0 <= value <= 1):
            continue

        current = latest.get(iso3)
        if current is None or year > current[0]:
            latest[iso3] = (
                year,
                {
                    "country": country,
                    "iso_code": iso3,
                    "human_development_index": f"{value:.3f}",
                    "year": str(year),
                },
            )

    rows = [payload for _, payload in latest.values()]
    rows.sort(key=lambda row: row["country"])
    return rows


def latest_income_rows(raw_csv: str) -> list[dict[str, str]]:
    latest: dict[str, tuple[int, dict[str, str]]] = {}

    for iso3, country, year, raw_value in _iter_owid_rows(
        raw_csv,
        [
            "World Bank's income classification",
            "Income classification",
            "Income group",
            "income_group",
        ],
    ):
        normalized = raw_value.strip().lower()
        key = INCOME_GROUP_KEYS.get(normalized)
        if key is None:
            continue

        current = latest.get(iso3)
        if current is None or year > current[0]:
            latest[iso3] = (
                year,
                {
                    "country": country,
                    "iso_code": iso3,
                    "income_group": key,
                    "income_group_label": _income_group_display(key),
                    "year": str(year),
                },
            )

    rows = [payload for _, payload in latest.values()]
    rows.sort(key=lambda row: row["country"])
    return rows


def _income_group_display(key: str) -> str:
    return {
        "low": "Low income",
        "lower_middle": "Lower-middle income",
        "upper_middle": "Upper-middle income",
        "high": "High income",
    }.get(key, key)


# ── CSV writers ──────────────────────────────────────────────────────────

def write_hdi_csv(rows: list[dict[str, str]], output_path: pathlib.Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, quoting=csv.QUOTE_ALL)
        writer.writerow(["", "country", "iso_code", "human_development_index", "year"])
        for idx, row in enumerate(rows, start=1):
            writer.writerow([
                idx,
                row["country"],
                row["iso_code"],
                row["human_development_index"],
                row["year"],
            ])


def write_income_csv(rows: list[dict[str, str]], output_path: pathlib.Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, quoting=csv.QUOTE_ALL)
        writer.writerow(["", "country", "iso_code", "income_group", "income_group_label", "year"])
        for idx, row in enumerate(rows, start=1):
            writer.writerow([
                idx,
                row["country"],
                row["iso_code"],
                row["income_group"],
                row["income_group_label"],
                row["year"],
            ])


def write_metadata(
    hdi_rows: list[dict[str, str]],
    income_rows: list[dict[str, str]],
    data_dir: pathlib.Path,
) -> None:
    hdi_years = [int(r["year"]) for r in hdi_rows if r.get("year")]
    income_years = [int(r["year"]) for r in income_rows if r.get("year")]

    metadata = {
        "generated_at_utc": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "indicators": {
            "hdi": {
                "source": "https://ourworldindata.org/grapher/human-development-index",
                "latest_year_global": max(hdi_years) if hdi_years else None,
                "countries": len(hdi_rows),
            },
            "income_groups": {
                "source": "https://ourworldindata.org/grapher/world-bank-income-groups",
                "latest_year_global": max(income_years) if income_years else None,
                "countries": len(income_rows),
                "categories": INCOME_GROUP_ORDER,
            },
        },
        # Legacy top-level fields (kept for backwards-compatible footer rendering).
        "source": "https://ourworldindata.org/grapher/human-development-index",
        "latest_year_global": max(hdi_years) if hdi_years else None,
        "countries": len(hdi_rows),
    }
    (data_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
    )


# ── Aliases (rebuilt from union of indicators) ───────────────────────────

def load_existing_aliases(path: pathlib.Path) -> dict[str, list[str]]:
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    if not isinstance(raw, dict):
        return {}

    aliases: dict[str, list[str]] = {}
    for iso3, values in raw.items():
        key = str(iso3).strip().upper()
        if len(key) != 3 or not isinstance(values, list):
            continue
        clean = [str(v).strip() for v in values if str(v).strip()]
        if clean:
            aliases[key] = clean
    return aliases


def fetch_country_names_and_iso2() -> tuple[dict[str, list[str]], dict[str, str]]:
    try:
        payload = download_json(DEFAULT_COUNTRY_NAMES_SOURCE)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        return {}, {}

    if not isinstance(payload, list):
        return {}, {}

    names_by_iso3: dict[str, list[str]] = {}
    iso2_by_iso3: dict[str, str] = {}
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        iso3 = str(entry.get("cca3") or "").strip().upper()
        if len(iso3) != 3:
            continue

        iso2 = str(entry.get("cca2") or "").strip().upper()
        if len(iso2) == 2:
            iso2_by_iso3[iso3] = iso2

        names: list[str] = []
        translations = entry.get("translations")
        if isinstance(translations, dict):
            spa = translations.get("spa")
            if isinstance(spa, dict):
                for field in ("common", "official"):
                    value = str(spa.get(field) or "").strip()
                    if value:
                        names.append(value)
        if names:
            names_by_iso3[iso3] = names

    return names_by_iso3, iso2_by_iso3


def _append_unique(target: list[str], values: list[str]) -> None:
    seen = {v.casefold() for v in target}
    for value in values:
        text = str(value).strip()
        if not text:
            continue
        marker = text.casefold()
        if marker in seen:
            continue
        target.append(text)
        seen.add(marker)


def _alias_sort_key(english_common: str, alias: str) -> tuple[int, int, int, str]:
    text = alias.strip()
    lowered = text.casefold()
    common = english_common.strip().casefold()
    if lowered == common:
        return (0, 0, len(text), lowered)
    official_markers = (
        "republic", "republica", "república", "reino", "kingdom",
        "federative", "federal", "commonwealth", "state of", "estado",
        "principado", "principality", "union", "unión",
        "democratic", "socialist", "islamic",
    )
    has_official = any(m in lowered for m in official_markers)
    return (2 if has_official else 1, len(text.split()), len(text), lowered)


def build_aliases(
    union_rows: dict[str, str],
    existing: dict[str, list[str]],
    spanish_names: dict[str, list[str]],
    iso2_by_iso3: dict[str, str],
) -> dict[str, list[str]]:
    aliases: dict[str, list[str]] = {}

    for iso3, country in union_rows.items():
        bucket = aliases.setdefault(iso3, [])
        _append_unique(bucket, [country])
        iso2 = iso2_by_iso3.get(iso3)
        if iso2:
            _append_unique(bucket, [iso2])
        _append_unique(bucket, spanish_names.get(iso3, []))
        _append_unique(bucket, existing.get(iso3, []))

    for iso3, names in existing.items():
        bucket = aliases.setdefault(iso3, [])
        _append_unique(bucket, names)
        _append_unique(bucket, spanish_names.get(iso3, []))

    extras = {
        "ESP": ["Spain", "España", "Espana"],
        "GBR": ["United Kingdom", "UK", "Great Britain", "Reino Unido"],
        "USA": ["United States", "US", "U.S.", "U.S.A", "EEUU", "Estados Unidos"],
        "DEU": ["Germany", "Alemania", "Deutschland"],
        "CZE": ["Czechia", "Czech Republic", "Republica Checa", "República Checa"],
        "KOR": ["South Korea", "Corea del Sur"],
        "PRK": ["North Korea", "Corea del Norte"],
        "CIV": ["Cote d'Ivoire", "Ivory Coast", "Côte d’Ivoire", "Costa de Marfil"],
        "NLD": ["Netherlands", "Holland", "Países Bajos", "Paises Bajos"],
        "RUS": ["Russia", "Rusia"],
        "TUR": ["Turkey", "Turkiye", "Türkiye", "Turquia", "Turquía"],
        "PSE": ["Palestine", "State of Palestine", "Palestina"],
    }
    for iso3, names in extras.items():
        bucket = aliases.setdefault(iso3, [])
        _append_unique(bucket, names)

    for iso3, bucket in aliases.items():
        english = union_rows.get(iso3, bucket[0] if bucket else "")
        bucket.sort(key=partial(_alias_sort_key, english))

    return dict(sorted(aliases.items(), key=lambda item: item[0]))


def write_aliases(aliases: dict[str, list[str]], data_dir: pathlib.Path) -> None:
    (data_dir / "country_aliases.json").write_text(
        json.dumps(aliases, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


# ── Main ─────────────────────────────────────────────────────────────────

def main() -> None:
    args = parse_args()
    data_dir = pathlib.Path(args.data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)

    print(f"Fetching HDI from {args.hdi_source}")
    hdi_rows = latest_hdi_rows(download_csv(args.hdi_source))
    write_hdi_csv(hdi_rows, data_dir / "hdi.csv")
    print(f"  → wrote {len(hdi_rows)} HDI rows")

    print(f"Fetching income groups from {args.income_source}")
    income_rows = latest_income_rows(download_csv(args.income_source))
    write_income_csv(income_rows, data_dir / "income_groups.csv")
    print(f"  → wrote {len(income_rows)} income-group rows")

    write_metadata(hdi_rows, income_rows, data_dir)

    union_rows: dict[str, str] = {}
    for row in hdi_rows:
        union_rows[row["iso_code"]] = row["country"]
    for row in income_rows:
        union_rows.setdefault(row["iso_code"], row["country"])

    existing = load_existing_aliases(data_dir / "country_aliases.json")
    spanish_names, iso2_by_iso3 = fetch_country_names_and_iso2()
    aliases = build_aliases(union_rows, existing, spanish_names, iso2_by_iso3)
    write_aliases(aliases, data_dir)
    print(f"Aliases rebuilt for {len(aliases)} ISO-3 codes")


if __name__ == "__main__":
    main()
