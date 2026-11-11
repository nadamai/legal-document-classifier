from __future__ import annotations

import csv
from pathlib import Path

import numpy as np
import pytest

import evaluate
from common import CSV_DELIMITER, site_of
from evaluate import (
    held_out_probabilities,
    lowest_precise_threshold,
    write_review,
)
from train import Options, TrainingError

URLS = [
    'https://policies.google.com/privacy',
    'https://www.google.com/shopping',
    'https://a.com/terms',
    'https://shop.a.com/cart',
    'https://b.com/terms',
    'https://b.com/blog',
    'https://c.pl/regulamin',
    'https://c.pl/sklep',
    'https://d.github.io/privacy',
    'https://e.github.io/recipes',
    'https://f.com/terms',
    'https://f.com/news',
]


class RecordingModel:
    def __init__(self, train_ids: set[int], scored: dict[int, set[int]]):
        self.train_ids = train_ids
        self.scored = scored

    def predict(self, features: list[dict[str, float]]) -> np.ndarray:
        ids = [int(next(iter(f))) for f in features]

        for page_id in ids:
            self.scored.setdefault(page_id, set()).update(self.train_ids)

        return np.full(len(ids), 0.5)


def test_no_page_is_scored_by_a_model_that_saw_its_site(
    monkeypatch: pytest.MonkeyPatch,
):
    pages = [
        {'url': url, 'label': n % 2} for n, url in enumerate(URLS)
    ]
    # One feature per page, naming the page, so the fake model knows whom it
    # scores.
    features = [{str(n): 1.0} for n in range(len(pages))]
    scored: dict[int, set[int]] = {}

    def fake_fit(train_pages, train_features, options):
        return RecordingModel(
            {int(next(iter(f))) for f in train_features}, scored
        )

    monkeypatch.setattr(evaluate, 'fit', fake_fit)

    held_out_probabilities(pages, features, Options())

    assert sorted(scored) == list(range(len(pages)))

    for page_id, train_ids in scored.items():
        site = site_of(URLS[page_id])

        assert site not in {site_of(URLS[n]) for n in train_ids}


def test_held_out_probabilities_need_two_sites():
    pages = [
        {'url': 'https://policies.google.com/privacy', 'label': 1},
        {'url': 'https://www.google.com/shopping', 'label': 0},
    ]

    with pytest.raises(TrainingError, match='at least 2 sites'):
        held_out_probabilities(pages, [{'a': 1.0}, {'b': 1.0}], Options())


def test_held_out_probabilities_need_both_labels_in_every_fold():
    pages = [
        {'url': 'https://a.com/terms', 'label': 1},
        {'url': 'https://b.com/terms', 'label': 1},
        {'url': 'https://c.com/shoes', 'label': 0},
    ]

    with pytest.raises(TrainingError, match='Too few pages of one label'):
        held_out_probabilities(pages, [{'a': 1.0}] * 3, Options(min_sites=1))


@pytest.mark.parametrize(
    ('labels', 'p', 'expected'),
    [
        # Perfectly separated: the lowest legal p, with every legal page.
        ([1, 1, 0, 0], [0.9, 0.8, 0.3, 0.1], (0.8, 2, 0)),
        # A not-legal page on top: precision is 99% nowhere below it.
        ([0, 1, 1, 0], [0.95, 0.9, 0.8, 0.1], None),
        # A tie between a legal and a not-legal page can't be split.
        ([1, 1, 0, 1], [0.9, 0.8, 0.8, 0.7], (0.9, 1, 0)),
        # 100 legal pages and 1 not-legal page above 0.4 are 99.0% precise.
        ([1] * 99 + [0, 1], [0.99] * 99 + [0.5, 0.4], (0.4, 100, 1)),
        # 51 and 1 are 98.1%, so the threshold stays above the not-legal page.
        ([1] * 50 + [0, 1], [0.99] * 50 + [0.5, 0.4], (0.99, 50, 0)),
    ],
)
def test_lowest_precise_threshold(
    labels: list[int], p: list[float], expected: tuple | None
):
    assert lowest_precise_threshold(np.array(labels), np.array(p)) == expected


def test_write_review_puts_the_most_doubtful_pages_first(data_root: Path):
    pages = [
        {'url': 'https://a.com/terms', 'title': 'Terms'},
        {'url': 'https://b.com/shoes', 'title': 'Shoes; sale'},
        {'url': 'https://c.com/privacy', 'title': 'Privacy'},
    ]

    write_review(
        'en', pages, np.array([1, 0, 1]), np.array([0.9, 0.6, 0.2])
    )

    path = data_root / 'training' / 'data' / 'review' / 'en.csv'

    with path.open(newline='', encoding='utf-8') as file:
        rows = list(csv.reader(file, delimiter=CSV_DELIMITER))

    assert rows == [
        ['url', 'label', 'p', 'title'],
        ['https://c.com/privacy', 'legal', '0.200', 'Privacy'],
        ['https://b.com/shoes', 'not-legal', '0.600', 'Shoes; sale'],
        ['https://a.com/terms', 'legal', '0.900', 'Terms'],
    ]
