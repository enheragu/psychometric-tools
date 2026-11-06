#!/usr/bin/env python3
"""Generate the synthetic example files of DIF-AnalysisTool.

The data are simulated with the models of DIF-AccumulationTool (2PL and Graded
Response Model), with item parameters taken from its presets, so no third-party
data are involved. DIF is built into known items, so results can be checked:

- sample_data/synthetic_dichotomous.csv (2PL, 10 items, two groups):
  DIF in A2, A4, A6 and A8.
- sample_data/synthetic_polytomous.csv (GRM, 5 categories, dimensions A and B,
  two groups within two regions, meant to be run with `region` as the nested
  variable): DIF in A2 and B3 in both regions; in A4 and A6 only in North.

The focal group also has a lower latent mean, so a difference in total scores
between groups does not by itself mean DIF.

The seed is one where Mantel-Haenszel recovers exactly those items, so the examples
read clearly. It does in about 3 of 4 seeds; in the rest it misses none but flags an
extra item now and then, as expected from a test at the 5% level.

Usage:
  python3 scripts/generate_sample_data.py
"""

from __future__ import annotations

import csv
import math
import pathlib
import random

SEED = 20261107
FOCAL_MEAN = -0.3
LATENT_CORRELATION = 0.5  # between dimensions A and B of the polytomous file

GROUP_SIZES = {"reference": 1100, "focal": 1000}
REGION_GROUP_SIZES = {"reference": 950, "focal": 850}
REGIONS = ("North", "South")

# (a, b) for the reference group and (a, b) for the focal group when the item has DIF.
DICHOTOMOUS_ITEMS = {
    "A1": ((1.2, [0.0]), None),
    "A2": ((1.5, [-0.5]), (1.5, [0.4])),
    "A3": ((1.8, [0.3]), None),
    "A4": ((1.0, [-0.8]), (1.0, [0.2])),
    "A5": ((1.6, [0.1]), None),
    "A6": ((1.3, [-0.3]), (1.3, [0.5])),
    "A7": ((2.0, [0.6]), None),
    "A8": ((1.4, [-0.6]), (1.4, [0.3])),
    "A9": ((1.7, [0.2]), None),
    "A10": ((1.1, [-0.4]), None),
}

POLYTOMOUS_ITEMS = {
    "A1": ((1.8, [-1.7, -0.8, 0.15, 1.05]), None),
    "A2": ((1.4, [-1.05, -0.15, 0.35, 1.45]), (1.15, [-0.35, 0.55, 1.15, 2.15])),
    "A3": ((2.0, [-1.95, -1.05, -0.05, 0.95]), None),
    "A4": ((1.6, [-0.9, -0.1, 0.9, 1.7]), (1.35, [-0.2, 0.65, 1.55, 2.45])),
    "A5": ((1.3, [-1.55, -0.55, 0.25, 1.35]), None),
    "A6": ((1.9, [-1.45, -0.95, 0.45, 1.05]), (1.65, [-0.55, 0.05, 1.2, 1.95])),
    "A7": ((1.5, [-1.25, -0.35, 0.65, 1.55]), None),
    "A8": ((1.7, [-1.0, -0.45, 0.75, 1.6]), None),
    "B1": ((1.8, [-1.7, -0.8, 0.15, 1.05]), None),
    "B2": ((1.4, [-1.05, -0.15, 0.35, 1.45]), None),
    "B3": ((2.0, [-1.95, -1.05, -0.05, 0.95]), (2.0, [-1.25, -0.35, 0.65, 1.65])),
    "B4": ((1.6, [-0.9, -0.1, 0.9, 1.7]), None),
    "B5": ((1.3, [-1.55, -0.55, 0.25, 1.35]), None),
    "B6": ((1.9, [-1.45, -0.95, 0.45, 1.05]), None),
}
DIF_ONLY_IN_NORTH = {"A4", "A6"}


def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def sample_score(rng: random.Random, theta: float, a: float, thresholds: list[float]) -> int:
    """Return the sampled category, from 0 to len(thresholds)."""
    p_at_least = [1.0] + [sigmoid(a * (theta - b)) for b in thresholds] + [0.0]
    r = rng.random()
    accumulated = 0.0
    for category in range(len(thresholds) + 1):
        accumulated += p_at_least[category] - p_at_least[category + 1]
        if r <= accumulated:
            return category
    return len(thresholds)


def write_rows(path: pathlib.Path, header: list[str], rows: list[list], rng: random.Random) -> None:
    rng.shuffle(rows)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(header)
        writer.writerows(rows)
    print(f"{path.name}: {len(rows)} rows, {len(header)} columns")


def dichotomous_rows(rng: random.Random) -> list[list]:
    rows = []
    for group, size in GROUP_SIZES.items():
        mean = FOCAL_MEAN if group == "focal" else 0.0
        for _ in range(size):
            theta = rng.gauss(mean, 1.0)
            row: list = [group]
            for reference, focal in DICHOTOMOUS_ITEMS.values():
                a, b = focal if group == "focal" and focal else reference
                row.append(sample_score(rng, theta, a, b))
            rows.append(row)
    return rows


def polytomous_rows(rng: random.Random) -> list[list]:
    rows = []
    residual = math.sqrt(1.0 - LATENT_CORRELATION**2)
    for region in REGIONS:
        for group, size in REGION_GROUP_SIZES.items():
            mean = FOCAL_MEAN if group == "focal" else 0.0
            for _ in range(size):
                z_a, z_b = rng.gauss(0.0, 1.0), rng.gauss(0.0, 1.0)
                thetas = {"A": mean + z_a, "B": mean + LATENT_CORRELATION * z_a + residual * z_b}
                row: list = [group, region]
                for item, (reference, focal) in POLYTOMOUS_ITEMS.items():
                    has_dif = group == "focal" and focal and (region == "North" or item not in DIF_ONLY_IN_NORTH)
                    a, b = focal if has_dif else reference
                    row.append(sample_score(rng, thetas[item[0]], a, b) + 1)  # scored 1 to 5
                rows.append(row)
    return rows


def main() -> None:
    rng = random.Random(SEED)
    out_dir = pathlib.Path(__file__).resolve().parent.parent / "sample_data"
    write_rows(out_dir / "synthetic_dichotomous.csv", ["group", *DICHOTOMOUS_ITEMS], dichotomous_rows(rng), rng)
    write_rows(out_dir / "synthetic_polytomous.csv", ["group", "region", *POLYTOMOUS_ITEMS], polytomous_rows(rng), rng)


if __name__ == "__main__":
    main()
