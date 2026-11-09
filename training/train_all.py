"""Train every language that has a folder in training/data/.

Each folder name must be a language code (`en`, `pt-BR`). Other folders are
skipped with a note. The training itself is train.py's.

Usage: training/.venv/bin/python training/train_all.py
"""

import sys

from train import DATA, LANGUAGE, ROOT, train_languages


def main():
    folders = sorted(path for path in DATA.iterdir() if path.is_dir())
    
    for folder in folders:
        if not LANGUAGE.fullmatch(folder.name):
            print(f'Skipping {folder.relative_to(ROOT)}: not a language code')
            
    languages = [f.name for f in folders if LANGUAGE.fullmatch(f.name)]
    
    if not languages:
        sys.exit(f'No language folders in {DATA.relative_to(ROOT)}')
        
    train_languages(languages)


if __name__ == '__main__':
    main()
