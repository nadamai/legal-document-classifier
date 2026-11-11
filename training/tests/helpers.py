"""Writers for hand-written URL lists and page CSVs, in the layout that the
scripts read from training/data/."""

from __future__ import annotations

import csv
from pathlib import Path

from common import CSV_DELIMITER, CSV_FIELDS


def write_urls(root: Path, lang: str, stem: str, urls: list[str]):
    path = root / 'training' / 'data' / 'urls' / lang / f'{stem}.txt'

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('\n'.join(urls) + '\n', encoding='utf-8')


def write_contents(root: Path, lang: str, stem: str, rows: list[dict]):
    path = root / 'training' / 'data' / 'contents' / lang / f'{stem}.csv'

    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open('w', newline='', encoding='utf-8') as file:
        writer = csv.DictWriter(
            file, fieldnames=CSV_FIELDS, delimiter=CSV_DELIMITER
        )

        writer.writeheader()
        writer.writerows(
            {field: row.get(field, '') for field in CSV_FIELDS} for row in rows
        )
