"""Train every language that has a folder in training/data/contents/.

Each folder name must be a language code (`en`, `pt-BR`). Other folders are
skipped with a note. The training itself is train.py's.

Usage: training/.venv/bin/python training/train_all.py
"""

from common import CONTENTS, language_folders
from train import train_languages


def main():
    train_languages(language_folders(CONTENTS))


if __name__ == '__main__':
    main()
