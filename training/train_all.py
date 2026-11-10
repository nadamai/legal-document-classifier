"""Train every language that has a folder in training/data/contents/.

Each folder name must be a language code (`en`, `pt-BR`). Other folders are
skipped with a note. The training itself is train.py's.

Usage: training/.venv/bin/python training/train_all.py [--min-sites N]
"""

import argparse

from common import CONTENTS, language_folders
from train import add_min_sites_option, train_languages


def main():
    parser = argparse.ArgumentParser(
        description='Train every language in training/data/contents/.'
    )
    add_min_sites_option(parser)

    args = parser.parse_args()

    train_languages(language_folders(CONTENTS), args.min_sites)


if __name__ == '__main__':
    main()
