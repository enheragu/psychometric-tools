#!/usr/bin/env python3
"""Update data/hdi.csv from Our World in Data.

- Downloads the HDI dataset CSV from OWID.
- Keeps the latest available year per ISO-3 country code.
- Writes compact latest snapshot to data/hdi.csv.

Usage:
  python3 scripts/update_hdi.py
  python3 scripts/update_hdi.py --source <url> --output data/hdi.csv
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import pathlib
from functools import partial
import urllib.error
import urllib.request

DEFAULT_SOURCE = (
    "https://ourworldindata.org/grapher/human-development-index.csv"
)
DEFAULT_COUNTRY_NAMES_SOURCE = (
    "https://restcountries.com/v3.1/all?fields=cca2,cca3,name,translations"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Update HDI CSV from OWID")
    parser.add_argument("--source", default=DEFAULT_SOURCE, help="OWID CSV URL")
    parser.add_argument("--output", default="data/hdi.csv", help="Output CSV path")
    return parser.parse_args()


def download_csv(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
            "Accept": "text/csv,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8")


def download_json(url: str) -> object:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
            "Accept": "application/json,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def latest_rows(raw_csv: str) -> list[dict[str, str]]:
    reader = csv.DictReader(io.StringIO(raw_csv))
    latest_by_iso: dict[str, tuple[int, dict[str, str]]] = {}

    for row in reader:
        iso3 = (row.get("Code") or "").strip()
        country = (row.get("Entity") or "").strip()
        hdi = row.get("Human Development Index")
        year_raw = row.get("Year")

        if not iso3 or len(iso3) != 3:
            continue
        if iso3.startswith("OWID_"):
            continue
        if not country or not hdi or hdi == "":
            continue

        try:
            year = int(float(str(year_raw)))
            value = float(str(hdi))
        except (TypeError, ValueError):
            continue

        if not (0 <= value <= 1):
            continue

        current = latest_by_iso.get(iso3)
        if current is None or year > current[0]:
            latest_by_iso[iso3] = (
                year,
                {
                    "country": country,
                    "iso_code": iso3,
                    "human_development_index": f"{value:.3f}",
                    "year": str(year),
                },
            )

    rows = [payload for _, payload in latest_by_iso.values()]
    rows.sort(key=lambda row: row["country"])
    return rows


def write_output(rows: list[dict[str, str]], output_path: pathlib.Path) -> None:
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


def write_metadata(rows: list[dict[str, str]], output_path: pathlib.Path) -> None:
    years = [int(r["year"]) for r in rows if r.get("year")]
    metadata = {
        "source": "https://ourworldindata.org/grapher/human-development-index",
        "generated_at_utc": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "latest_year_global": max(years) if years else None,
        "countries": len(rows),
    }
    meta_path = output_path.parent / "metadata.json"
    meta_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")


def load_existing_aliases(path: pathlib.Path) -> dict[str, list[str]]:
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}

    aliases: dict[str, list[str]] = {}
    if not isinstance(raw, dict):
        return aliases

    for iso3, values in raw.items():
        key = str(iso3).strip().upper()
        if len(key) != 3 or not isinstance(values, list):
            continue
        clean_values = [str(v).strip() for v in values if str(v).strip()]
        if clean_values:
            aliases[key] = clean_values
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
        "republic",
        "republica",
        "república",
        "reino",
        "kingdom",
        "federative",
        "federal",
        "commonwealth",
        "state of",
        "estado",
        "principado",
        "principality",
        "union",
        "unión",
        "democratic",
        "socialist",
        "islamic",
    )
    has_official_marker = any(marker in lowered for marker in official_markers)
    words = len(text.split())

    return (
        2 if has_official_marker else 1,
        words,
        len(text),
        lowered,
    )


def _prioritize_common_aliases(aliases: dict[str, list[str]], rows: list[dict[str, str]]) -> None:
    country_by_iso = {
        row["iso_code"].strip().upper(): row["country"].strip()
        for row in rows
        if row.get("iso_code") and row.get("country")
    }

    for iso3, bucket in aliases.items():
        english_common = country_by_iso.get(iso3, bucket[0] if bucket else "")
        bucket.sort(key=partial(_alias_sort_key, english_common))


def build_aliases(
    rows: list[dict[str, str]],
    existing_aliases: dict[str, list[str]],
    spanish_names: dict[str, list[str]],
    iso2_by_iso3: dict[str, str],
) -> dict[str, list[str]]:
    aliases: dict[str, list[str]] = {}

    for row in rows:
        iso3 = row["iso_code"].strip().upper()
        country = row["country"].strip()
        if len(iso3) != 3 or not country:
            continue

        bucket = aliases.setdefault(iso3, [])
        _append_unique(bucket, [country])
        iso2 = iso2_by_iso3.get(iso3)
        if iso2:
            _append_unique(bucket, [iso2])
        _append_unique(bucket, spanish_names.get(iso3, []))
        _append_unique(bucket, existing_aliases.get(iso3, []))

    # Preserve aliases for codes that are currently not present in the HDI snapshot.
    for iso3, names in existing_aliases.items():
        bucket = aliases.setdefault(iso3, [])
        _append_unique(bucket, names)
        _append_unique(bucket, spanish_names.get(iso3, []))

    # Curated short/common alternatives.
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

    _prioritize_common_aliases(aliases, rows)

    return dict(sorted(aliases.items(), key=lambda item: item[0]))


def write_aliases(aliases: dict[str, list[str]], output_path: pathlib.Path) -> None:
    aliases_path = output_path.parent / "country_aliases.json"
    aliases_path.write_text(json.dumps(aliases, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    args = parse_args()
    raw = download_csv(args.source)
    rows = latest_rows(raw)
    output = pathlib.Path(args.output)
    write_output(rows, output)
    write_metadata(rows, output)
    existing_aliases = load_existing_aliases(output.parent / "country_aliases.json")
    spanish_names, iso2_by_iso3 = fetch_country_names_and_iso2()
    aliases = build_aliases(rows, existing_aliases, spanish_names, iso2_by_iso3)
    write_aliases(aliases, output)
    print(f"Updated {output} with {len(rows)} countries")


if __name__ == "__main__":
    main()
