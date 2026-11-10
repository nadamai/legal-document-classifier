"""Paths, the page CSV format, URL helpers and the per-language loop that
scrape.py and train.py share."""

from __future__ import annotations

import csv
import re
import sys
from collections.abc import Callable
from ipaddress import ip_address
from pathlib import Path
from urllib.parse import urlsplit

from publicsuffixlist import PublicSuffixList

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'training' / 'data'
URLS = DATA / 'urls'
CONTENTS = DATA / 'contents'

# File stem in urls/<lang>/ and contents/<lang>/ → label.
LABELS = {'legal': 1, 'not-legal': 0}

CSV_FIELDS = ('url', 'title', 'h1', 'h2', 'h3', 'content')
CSV_DELIMITER = ';'

# Codes become file paths, so nothing else may pass.
LANGUAGE = re.compile(r'[a-z]{2,3}(-[A-Za-z0-9]+)*')

PUBLIC_SUFFIXES = PublicSuffixList()

# A page's text can be longer than the csv module's default 128 KiB field.
csv.field_size_limit(2**31 - 1)


class LanguageError(Exception):
    """Stops one language. The other languages still run."""


def with_scheme(url: str) -> str:
    return url if '://' in url else f'https://{url}'


def read_urls(path: Path) -> list[str]:
    if not path.exists():
        raise LanguageError(f'Missing {path.relative_to(ROOT)}')

    lines = path.read_text(encoding='utf-8').splitlines()
    urls = (line.strip() for line in lines if line.strip())

    return list(dict.fromkeys(with_scheme(url) for url in urls))


def site_of(url: str) -> str:
    """The registrable domain: policies.google.com and support.google.com are
    one site, while each *.com.pl or *.github.io name is a site of its own."""

    host = urlsplit(with_scheme(url)).hostname or ''

    try:
        ip_address(host)

        return host
    except ValueError:
        return PUBLIC_SUFFIXES.privatesuffix(host) or host


def check_language(lang: str):
    if not LANGUAGE.fullmatch(lang):
        raise LanguageError(f'Invalid language code "{lang}"')


def language_folders(parent: Path) -> list[str]:
    if not parent.is_dir():
        sys.exit(f'Missing {parent.relative_to(ROOT)}')

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
