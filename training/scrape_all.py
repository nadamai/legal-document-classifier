"""Scrape every language that has a folder in training/data/urls/.

Each folder name must be a language code (`en`, `pt-BR`). Other folders are
skipped with a note. The scraping itself is scrape.py's.

Usage: training/.venv/bin/python training/scrape_all.py
"""

from common import URLS, language_folders
from scrape import scrape_languages


def main():
    scrape_languages(language_folders(URLS))


if __name__ == '__main__':
    main()
