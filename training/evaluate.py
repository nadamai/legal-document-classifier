"""Measure how the model does on sites it has never seen.

For each language, splits the sites into 5 groups and scores each group's
pages with a model fitted, exactly as train.py fits it, on the other four. No
page is scored by a model that saw its site. Prints AUC, precision and recall
at several thresholds, and the lowest threshold with 99% precision.

Writes training/data/review/<lang>.csv: every page with its held-out p, the
ones that disagree most with their label first.

Usage: training/.venv/bin/python training/evaluate.py [options] [lang ...]
(default: every language in training/data/contents/; --help lists the options)
"""

from __future__ import annotations

import argparse
import csv

import numpy as np
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold

from common import (
    CONTENTS,
    CSV_DELIMITER,
    DATA,
    ROOT,
    language_folders,
    run_languages,
    site_of,
)
from train import (
    Options,
    TrainingError,
    add_training_options,
    fit,
    load_pages,
    options_from,
)

FOLDS = 5
TARGET_PRECISION = 0.99
THRESHOLDS = (0.5, 0.7, 0.8, 0.9, 0.95, 0.99)
REVIEW = DATA / 'review'
SUSPECTS_SHOWN = 3


def held_out_probabilities(
    pages: list[dict], features: list[dict[str, float]], options: Options
) -> np.ndarray:
    sites = [site_of(page['url']) for page in pages]
    folds = min(FOLDS, len(set(sites)))

    if folds < 2:
        raise TrainingError('Need pages from at least 2 sites to evaluate')

    probabilities = np.zeros(len(pages))

    for train_rows, test_rows in GroupKFold(n_splits=folds).split(
        pages, groups=sites
    ):
        train_pages = [pages[row] for row in train_rows]

        if len({page['label'] for page in train_pages}) < 2:
            raise TrainingError('Too few pages of one label to evaluate')

        train_features = [features[row] for row in train_rows]
        model = fit(train_pages, train_features, options)
        probabilities[test_rows] = model.predict(
            [features[row] for row in test_rows]
        )

    return probabilities


def lowest_precise_threshold(
    labels: np.ndarray, probabilities: np.ndarray
) -> tuple[float, int, int] | None:
    """The threshold that keeps the most legal pages while precision stays at
    TARGET_PRECISION, with its true and false positives."""

    order = np.argsort(-probabilities, kind='stable')
    p, y = probabilities[order], labels[order]
    true_positives = np.cumsum(y)
    false_positives = np.cumsum(1 - y)

    # A threshold can only fall between two different values of p.
    cuts = np.r_[p[1:] != p[:-1], True]
    precise = cuts & (
        true_positives >= TARGET_PRECISION * (true_positives + false_positives)
    )
    rows = np.flatnonzero(precise)

    if rows.size == 0:
        return None

    row = rows[-1]

    return float(p[row]), int(true_positives[row]), int(false_positives[row])


def print_report(
    pages: list[dict], labels: np.ndarray, probabilities: np.ndarray
):
    legal = int(labels.sum())
    not_legal = len(labels) - legal
    sites = len({site_of(page['url']) for page in pages})

    print(f'{len(pages):,} pages ({legal:,} legal, {not_legal:,} not legal) '
          f'from {sites:,} sites, each scored by a model that never saw its '
          f'site.\n')
    print(f'AUC: {roc_auc_score(labels, probabilities):.3f}\n')
    print('   p ≥   precision   recall   not-legal pages above')

    for threshold in THRESHOLDS:
        above = probabilities >= threshold
        true_positives = int((above & (labels == 1)).sum())
        false_positives = int((above & (labels == 0)).sum())
        precision = (
            f'{true_positives / (true_positives + false_positives):6.1%}'
            if above.any() else '     –'
        )
        recall = true_positives / legal

        print(f'  {threshold:.2f}    {precision}    {recall:6.1%}    '
              f'{false_positives:,} of {not_legal:,}')

    found = lowest_precise_threshold(labels, probabilities)
    target = f'{TARGET_PRECISION:.0%} precision'

    if found is None:
        print(f'\nNo threshold reaches {target}.')
    else:
        threshold, true_positives, false_positives = found

        print(f'\n{target} from p ≥ {threshold:.3f}: recall '
              f'{true_positives / legal:.1%}, {false_positives} not-legal '
              f'pages above')


def write_review(
    lang: str,
    pages: list[dict],
    labels: np.ndarray,
    probabilities: np.ndarray,
):
    path = REVIEW / f'{lang}.csv'
    rows = np.argsort(-np.abs(labels - probabilities), kind='stable')

    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open('w', newline='', encoding='utf-8') as file:
        writer = csv.writer(file, delimiter=CSV_DELIMITER)

        writer.writerow(['url', 'label', 'p', 'title'])

        for row in rows:
            writer.writerow([
                pages[row]['url'],
                'legal' if labels[row] else 'not-legal',
                f'{probabilities[row]:.3f}',
                pages[row]['title'],
            ])

    print(f'\nMost likely mislabelled (every page is in '
          f'{path.relative_to(ROOT)}):')

    for label in (0, 1):
        shown = [row for row in rows if labels[row] == label][:SUSPECTS_SHOWN]

        for row in shown:
            name = 'legal' if label else 'not-legal'

            print(f'  {name:<9}  p {probabilities[row]:.2f}  '
                  f'{pages[row]["url"]}')


def evaluate_language(lang: str, options: Options):
    pages, features = load_pages(lang)
    labels = np.array([page['label'] for page in pages])
    probabilities = held_out_probabilities(pages, features, options)

    print_report(pages, labels, probabilities)
    write_review(lang, pages, labels, probabilities)


def main():
    parser = argparse.ArgumentParser(
        description='Measure the model on sites it has never seen.'
    )
    parser.add_argument(
        'languages', nargs='*', metavar='lang',
        help='language codes (default: every language with page texts)',
    )
    add_training_options(parser)

    args = parser.parse_args()
    options = options_from(args)

    run_languages(
        args.languages or language_folders(CONTENTS),
        lambda lang: evaluate_language(lang, options),
        'Evaluation',
    )


if __name__ == '__main__':
    main()
