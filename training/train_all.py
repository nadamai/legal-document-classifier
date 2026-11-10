"""Train every language that has a folder in training/data/contents/.

Each folder name must be a language code (`en`, `pt-BR`). Other folders are
skipped with a note. The training itself is train.py's.

Usage: training/.venv/bin/python training/train_all.py [options]
(--help lists the options)
"""

import argparse

from common import CONTENTS, language_folders
from train import add_training_options, options_from, train_languages


def main():
    parser = argparse.ArgumentParser(
        description='Train every language in training/data/contents/.'
    )
    add_training_options(parser)

    args = parser.parse_args()

    train_languages(language_folders(CONTENTS), options_from(args))


if __name__ == '__main__':
    main()
