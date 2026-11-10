"""Train the logistic regression for each given language.

For every language, reads training/data/contents/<lang>/legal.csv and
not-legal.csv, gets the features from the package's own TypeScript code
(tools/featurize.ts), fits the model and writes the bias and token weights to
src/weights/<lang>.json.

Fitting drops the features found on fewer than --min-sites sites, keeps the
--max-weights strongest weights, refits on those and rounds them.

Usage: training/.venv/bin/python training/train.py [options] [lang ...]
(default: en; --help lists the options)
"""

from __future__ import annotations

import argparse
import csv
import json
import subprocess
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from sklearn.feature_extraction import DictVectorizer
from sklearn.linear_model import LogisticRegression

from common import (
    CONTENTS,
    CSV_DELIMITER,
    LABELS,
    ROOT,
    URLS,
    LanguageError,
    read_urls,
    run_languages,
    site_of,
)

# Inverse regularisation strength. npm run evaluate compared 0.1 to 30, and 1
# gave the best AUC and the most recall at 99% precision.
C = 1.0

# A feature on fewer sites is a brand, a person's name or one site's
# boilerplate, which the published weights mustn't contain.
MIN_SITES = 5

MAX_WEIGHTS = 2_000

SIGNIFICANT_DIGITS = 4


class TrainingError(LanguageError):
    pass


@dataclass(frozen=True)
class Options:
    min_sites: int = MIN_SITES
    max_weights: int = MAX_WEIGHTS
    c: float = C


@dataclass
class Fit:
    vectorizer: DictVectorizer
    classifier: LogisticRegression
    summary: str

    def predict(self, features: list[dict[str, float]]) -> np.ndarray:
        matrix = self.vectorizer.transform(features)

        return self.classifier.predict_proba(matrix)[:, 1]


def read_pages(lang: str) -> list[dict]:
    """The URL lists decide the labels: a row whose URL has left its label's
    list, for example to be relabelled, is ignored."""

    pages = []
    ignored = 0

    for stem, label in LABELS.items():
        path = CONTENTS / lang / f'{stem}.csv'
        listed = set(read_urls(URLS / lang / f'{stem}.txt'))

        if not path.exists():
            raise TrainingError(f'Missing {path.relative_to(ROOT)}')

        with path.open(newline='', encoding='utf-8') as file:
            for row in csv.DictReader(file, delimiter=CSV_DELIMITER):
                if row['url'] not in listed:
                    ignored += 1

                    continue

                pages.append({
                    'url': row['url'],
                    'label': label,
                    'content': row['content'],
                    'title': (row.get('title') or '').strip(),
                    'h1': heading_lines(row.get('h1')),
                    'h2': heading_lines(row.get('h2')),
                    'h3': heading_lines(row.get('h3')),
                })

    if ignored:
        print(f'Ignored {ignored} page(s) no longer in their URL list')

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


def load_pages(lang: str) -> tuple[list[dict], list[dict[str, float]]]:
    pages = read_pages(lang)
    features = featurize(pages)

    # The classifier returns 0 for text without tokens, so such pages can't
    # teach it anything.
    kept = [(page, f) for page, f in zip(pages, features) if f]

    if len(kept) < len(pages):
        print(f'Skipped {len(pages) - len(kept)} page(s) without tokens')

    if len({page['label'] for page, _ in kept}) < 2:
        raise TrainingError(
            'Need at least one legal and one not-legal page with text'
        )

    return [page for page, _ in kept], [f for _, f in kept]


def drop_rare_features(
    pages: list[dict], features: list[dict[str, float]], min_sites: int
) -> tuple[list[dict[str, float]], str]:
    """Only removes columns, so the remaining values are still exactly what
    tools/featurize.ts computed, and what production computes."""

    features_by_site: dict[str, set[str]] = defaultdict(set)

    for page, page_features in zip(pages, features):
        features_by_site[site_of(page['url'])].update(page_features)

    site_counts = Counter(
        feature
        for site_features in features_by_site.values()
        for feature in site_features
    )
    common = {
        feature
        for feature, count in site_counts.items()
        if count >= min_sites
    }

    if not common:
        raise TrainingError(
            f'No feature is on {min_sites} or more sites. Add pages from more '
            f'sites, or lower --min-sites.'
        )

    summary = (
        f'{len(common):,} of {len(site_counts):,} features are on '
        f'{min_sites} or more of the {len(features_by_site):,} sites'
    )

    return [
        {name: v for name, v in page_features.items() if name in common}
        for page_features in features
    ], summary


def fit_logistic_regression(
    features: list[dict[str, float]], labels: list[int], c: float
) -> tuple[DictVectorizer, LogisticRegression]:
    vectorizer = DictVectorizer()
    classifier = LogisticRegression(C=c, max_iter=1000)

    classifier.fit(vectorizer.fit_transform(features), labels)

    return vectorizer, classifier


def round_significant(values: np.ndarray) -> np.ndarray:
    return np.array([float(f'{v:.{SIGNIFICANT_DIGITS}g}') for v in values])


def fit(
    pages: list[dict], features: list[dict[str, float]], options: Options
) -> Fit:
    labels = [page['label'] for page in pages]

    features, summary = drop_rare_features(pages, features, options.min_sites)
    vectorizer, classifier = fit_logistic_regression(
        features, labels, options.c
    )
    names = vectorizer.get_feature_names_out()

    # Refitting on the strongest lets their weights and the bias make up for
    # the dropped ones.
    if len(names) > options.max_weights:
        order = np.argsort(-np.abs(classifier.coef_[0]), kind='stable')
        strongest = set(names[order[: options.max_weights]])
        features = [
            {name: v for name, v in f.items() if name in strongest}
            for f in features
        ]
        vectorizer, classifier = fit_logistic_regression(
            features, labels, options.c
        )
        summary += f', and the {options.max_weights:,} strongest are kept'

    # Rounded in place, so every p reported here is exactly the p that the
    # published weights give.
    classifier.coef_[0] = round_significant(classifier.coef_[0])

    return Fit(vectorizer, classifier, summary)


def export(model: Fit, path: Path) -> dict[str, float]:
    tokens = model.vectorizer.get_feature_names_out()

    # Strongest legal signals first, strongest non-legal signals last. Ties are
    # broken by token, so the file stays byte-identical between runs.
    weights = dict(sorted(
        (
            (str(token), float(weight))
            for token, weight in zip(tokens, model.classifier.coef_[0])
            if weight != 0
        ),
        key=lambda item: (-item[1], item[0]),
    ))

    bias = float(model.classifier.intercept_[0])
    payload = {'bias': bias, 'weights': weights}

    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent='\t') + '\n',
        encoding='utf-8',
    )

    return weights


def report(
    pages: list[dict],
    probabilities: np.ndarray,
    weights: dict[str, float],
    path: Path,
):
    labels = np.array([page['label'] for page in pages])

    print(f'Pages: {labels.sum():,} legal, {(labels == 0).sum():,} not legal')
    print(f'Wrote {path.relative_to(ROOT)}: {len(weights):,} token weights, '
          f'{path.stat().st_size / 1024:.1f} KB')
    print(f'Median p on the training pages: '
          f'legal {np.median(probabilities[labels == 1]):.2f}, '
          f'not legal {np.median(probabilities[labels == 0]):.2f}. '
          f'npm run evaluate measures unseen sites.')

    ranked = sorted(weights.items(), key=lambda item: item[1])

    print('\nStrongest legal tokens:   ',
          ', '.join(f'{t} {w:+.3f}' for t, w in reversed(ranked[-10:])))

    print('Strongest non-legal tokens:',
          ', '.join(f'{t} {w:+.3f}' for t, w in ranked[:10]))


def train_language(lang: str, options: Options):
    pages, features = load_pages(lang)
    model = fit(pages, features, options)

    print(model.summary)

    path = ROOT / 'src' / 'weights' / f'{lang}.json'
    weights = export(model, path)

    report(pages, model.predict(features), weights, path)


def train_languages(languages: list[str], options: Options = Options()):
    run_languages(
        languages, lambda lang: train_language(lang, options), 'Training'
    )


def positive_int(value: str) -> int:
    number = int(value)

    if number < 1:
        raise argparse.ArgumentTypeError('must be 1 or more')

    return number


def positive_float(value: str) -> float:
    number = float(value)

    if not number > 0:
        raise argparse.ArgumentTypeError('must be more than 0')

    return number


def add_training_options(parser: argparse.ArgumentParser):
    parser.add_argument(
        '--min-sites',
        type=positive_int,
        default=MIN_SITES,
        metavar='N',
        help='keep only features found on at least N sites '
        f'(default: {MIN_SITES}; 1 keeps every feature)',
    )
    parser.add_argument(
        '--max-weights',
        type=positive_int,
        default=MAX_WEIGHTS,
        metavar='N',
        help=f'keep only the N strongest weights (default: {MAX_WEIGHTS:,})',
    )
    parser.add_argument(
        '--c',
        type=positive_float,
        default=C,
        metavar='C',
        help='inverse regularisation strength: lower means smaller weights '
        f'(default: {C})',
    )


def options_from(args: argparse.Namespace) -> Options:
    return Options(args.min_sites, args.max_weights, args.c)


def main():
    parser = argparse.ArgumentParser(
        description='Train the weights for each given language.'
    )
    parser.add_argument(
        'languages', nargs='*', default=['en'], metavar='lang',
        help='language codes (default: en)',
    )
    add_training_options(parser)

    args = parser.parse_args()

    train_languages(args.languages, options_from(args))


if __name__ == '__main__':
    main()
