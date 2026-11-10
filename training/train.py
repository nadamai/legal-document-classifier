"""Train the logistic regression for each given language.

For every language, reads training/data/contents/<lang>/legal.csv and
not-legal.csv, gets the features from the package's own TypeScript code
(tools/featurize.ts) and writes the bias and token weights to
src/weights/<lang>.json.

Usage: training/.venv/bin/python training/train.py [lang ...]   (default: en)
"""

from __future__ import annotations

import csv
import json
import subprocess
import sys
from pathlib import Path

from sklearn.feature_extraction import DictVectorizer
from sklearn.linear_model import LogisticRegression

from common import (
    CONTENTS,
    CSV_DELIMITER,
    LABELS,
    ROOT,
    LanguageError,
    run_languages,
)

# Inverse regularisation strength.
# TODO: Tune it once there is enough data.
C = 1.0


class TrainingError(LanguageError):
    pass


def read_pages(lang: str) -> list[dict]:
    pages = []
    
    for stem, label in LABELS.items():
        path = CONTENTS / lang / f'{stem}.csv'
        
        if not path.exists():
            raise TrainingError(f'Missing {path.relative_to(ROOT)}')
        
        with path.open(newline='', encoding='utf-8') as file:
            for row in csv.DictReader(file, delimiter=CSV_DELIMITER):
                pages.append({
                    'url': row['url'],
                    'label': label,
                    'content': row['content'],
                    'title': (row.get('title') or '').strip(),
                    'h1': heading_lines(row.get('h1')),
                    'h2': heading_lines(row.get('h2')),
                    'h3': heading_lines(row.get('h3')),
                })
                
    return pages


def heading_lines(value: str | None) -> list[str]:
    """One heading per line in the CSV, as a list without empty lines."""
    return [line.strip() for line in (value or '').splitlines() if line.strip()]


def featurize(pages: list[dict]) -> list[dict[str, float]]:
    """Features come from tools/featurize.ts. Python never computes them."""

    tsx = ROOT / 'node_modules' / '.bin' / 'tsx'
    fields = ('content', 'title', 'h1', 'h2', 'h3')

    stdin = ''.join(
        json.dumps({field: page[field] for field in fields}) + '\n'
        for page in pages
    )
    
    result = subprocess.run(
        [str(tsx), 'tools/featurize.ts'],
        cwd=ROOT,
        input=stdin,
        capture_output=True,
        encoding='utf-8',
    )
    
    if result.returncode != 0:
        raise TrainingError(f'tools/featurize.ts failed:\n{result.stderr}')
    
    features = [json.loads(line) for line in result.stdout.splitlines() if line]
    
    if len(features) != len(pages):
        raise TrainingError(
            f'Got {len(features)} feature sets for {len(pages)} pages'
        )
    
    return features


def export(vectorizer: DictVectorizer, model: LogisticRegression, path: Path):
    tokens = vectorizer.get_feature_names_out()
    
    # Strongest legal signals first, strongest non-legal signals last. Ties are
    # broken by token, so the file stays byte-identical between runs.
    weights = dict(sorted(
        (
            (str(token), float(weight))
            for token, weight in zip(tokens, model.coef_[0])
            if weight != 0
        ),
        key=lambda item: (-item[1], item[0]),
    ))
    
    payload = {'bias': float(model.intercept_[0]), 'weights': weights}
    
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent='\t') + '\n',
        encoding='utf-8',
    )
    
    return weights


def report(pages, probabilities, weights, path: Path):
    legal = sum(page['label'] for page in pages)
    
    print(f'Pages: {legal} legal, {len(pages) - legal} not legal')
    
    print(f'Wrote {path.relative_to(ROOT)}: {len(weights)} token weights, '
          f'{path.stat().st_size / 1024:.1f} KB')
    
    print('\nTraining pages (not a held-out evaluation):')
    
    for page, probability in zip(pages, probabilities):
        label = 'legal' if page['label'] else 'not legal'
        
        print(f'  p = {probability:.4f}  {label:<9}  {page["url"]}')
        
    ranked = sorted(weights.items(), key=lambda item: item[1])
    
    print('\nStrongest legal tokens:   ',
          ', '.join(f'{t} {w:+.3f}' for t, w in reversed(ranked[-10:])))
    
    print('Strongest non-legal tokens:',
          ', '.join(f'{t} {w:+.3f}' for t, w in ranked[:10]))


def train_language(lang: str):
    pages = read_pages(lang)
    features = featurize(pages)

    # The classifier returns 0 for text without tokens, so such pages can't
    # teach it anything.
    kept = [(page, f) for page, f in zip(pages, features) if f]
    
    if len(kept) < len(pages):
        print(f'Skipped {len(pages) - len(kept)} page(s) without tokens')
        
    pages = [page for page, _ in kept]
    features = [f for _, f in kept]
    labels = [page['label'] for page in pages]
    
    if len(set(labels)) < 2:
        raise TrainingError(
            'Need at least one legal and one not-legal page with text'
        )

    vectorizer = DictVectorizer()
    matrix = vectorizer.fit_transform(features)
    model = LogisticRegression(C=C, max_iter=1000)
    model.fit(matrix, labels)

    path = ROOT / 'src' / 'weights' / f'{lang}.json'
    weights = export(vectorizer, model, path)
    
    report(pages, model.predict_proba(matrix)[:, 1], weights, path)


def train_languages(languages: list[str]):
    run_languages(languages, train_language, 'Training')


def main():
    train_languages(sys.argv[1:] or ['en'])


if __name__ == '__main__':
    main()
