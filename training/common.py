"""Paths, the page CSV format and the per-language loop that scrape.py and
train.py share."""

from __future__ import annotations

import re
import sys
from collections.abc import Callable
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET = ROOT / 'dataset'
DATA = ROOT / 'training' / 'data'

# File stem in dataset/<lang>/ and training/data/<lang>/ → label.
LABELS = {'legal': 1, 'not-legal': 0}

CSV_FIELDS = ('url', 'title', 'h1', 'h2', 'h3', 'content')
CSV_DELIMITER = ';'

# Codes become file paths, so nothing else may pass.
LANGUAGE = re.compile(r'[a-z]{2,3}(-[A-Za-z0-9]+)*')


class LanguageError(Exception):
    """Stops one language. The other languages still run."""


def check_language(lang: str):
    if not LANGUAGE.fullmatch(lang):
        raise LanguageError(f'Invalid language code "{lang}"')


def language_folders(parent: Path) -> list[str]:
    folders = sorted(path for path in parent.iterdir() if path.is_dir())

    for folder in folders:
        if not LANGUAGE.fullmatch(folder.name):
            print(f'Skipping {folder.relative_to(ROOT)}: not a language code')

    languages = [f.name for f in folders if LANGUAGE.fullmatch(f.name)]

    if not languages:
        sys.exit(f'No language folders in {parent.relative_to(ROOT)}')

    return languages


def run_languages(
    languages: list[str], run: Callable[[str], None], task: str
):
    """Runs each language in turn, then exits with an error if any failed."""

    failed = []

    for index, lang in enumerate(dict.fromkeys(languages)):
        if index > 0:
            print()

        print(f'== {lang} ==')

        try:
            check_language(lang)
            run(lang)
        except LanguageError as error:
            sys.stdout.flush()

            print(f'Failed: {error}', file=sys.stderr, flush=True)

            failed.append(lang)

    if failed:
        sys.stdout.flush()
        sys.exit(f'\n{task} failed for: {", ".join(failed)}')
