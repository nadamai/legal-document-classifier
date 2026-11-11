"""Reading pages, the featurize.ts boundary, fitting and the weights file.
Feature sets here are hand-written dicts: Python never computes features."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
import pytest

import train
from helpers import write_contents, write_urls
from train import (
    Options,
    TrainingError,
    drop_rare_features,
    export,
    featurize,
    fit,
    heading_lines,
    load_pages,
    positive_float,
    positive_int,
    read_pages,
)

LEGAL_TERMS = ('§', 'privacy', 'terms', 'liability', 'consent', 'regulamin')
OTHER_TERMS = ('shoes', 'cart', 'blog', 'recipe', 'weather', 'news')


def synthetic_pages(sites: int = 8) -> tuple[list[dict], list[dict]]:
    """Two pages per site, one of each label. Each site also has its own
    brand feature, which is on one site only."""

    pages, features = [], []

    for site in range(sites):
        for label, terms in ((1, LEGAL_TERMS), (0, OTHER_TERMS)):
            pages.append({'url': f'https://site{site}.com/{label}', 'label': label})
            features.append({
                **{term: 1.0 for term in terms[: 3 + site % 4]},
                f'brand{site}': 1.0,
            })

    return pages, features


# Reading pages


def test_heading_lines_drops_blank_lines_and_spaces():
    assert heading_lines(' Orders \n\n  Returns\n') == ['Orders', 'Returns']
    assert heading_lines('') == []
    assert heading_lines(None) == []


def test_read_pages_labels_by_file_and_ignores_unlisted_urls(
    data_root: Path, capsys: pytest.CaptureFixture[str]
):
    write_urls(data_root, 'en', 'legal', ['example.com/terms'])
    write_urls(data_root, 'en', 'not-legal', ['https://example.com/shoes'])
    write_contents(data_root, 'en', 'legal', [
        {'url': 'https://example.com/terms', 'title': ' Terms ', 'content': 'a'},
        {'url': 'https://example.com/moved', 'content': 'b'},
    ])
    write_contents(data_root, 'en', 'not-legal', [
        {'url': 'https://example.com/shoes', 'h2': 'Sizes\nColours', 'content': 'c'},
    ])

    pages = read_pages('en')

    assert [(p['url'], p['label']) for p in pages] == [
        ('https://example.com/terms', 1),
        ('https://example.com/shoes', 0),
    ]
    assert pages[0]['title'] == 'Terms'
    assert pages[1]['h2'] == ['Sizes', 'Colours']
    assert 'Ignored 1 page(s)' in capsys.readouterr().out


def test_read_pages_fails_without_the_csv(
    data_root: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(train, 'ROOT', data_root)
    write_urls(data_root, 'en', 'legal', ['https://example.com/terms'])
    write_urls(data_root, 'en', 'not-legal', ['https://example.com/shoes'])

    with pytest.raises(TrainingError, match='Missing training/data/contents'):
        read_pages('en')


# The TypeScript boundary


def test_featurize_gets_the_features_from_the_typescript_code():
    features = featurize([
        {'content': 'We protect your privacy.', 'title': 'Privacy Policy',
         'h1': ['Privacy Policy'], 'h2': []},
        {'content': '1 2 3', 'title': '404', 'h1': [], 'h2': []},
    ])

    assert len(features) == 2
    assert {'privacy', 'title:privacy', 'title:privacy policy', 'h1:privacy'} <= (
        features[0].keys()
    )
    assert features[1] == {}


def test_load_pages_skips_pages_without_tokens(
    data_root: Path, capsys: pytest.CaptureFixture[str]
):
    legal = ['https://a.example/terms', 'https://b.example/empty']
    not_legal = ['https://a.example/shoes']

    write_urls(data_root, 'en', 'legal', legal)
    write_urls(data_root, 'en', 'not-legal', not_legal)
    write_contents(data_root, 'en', 'legal', [
        {'url': legal[0], 'title': 'Terms', 'content': 'These terms apply.'},
        {'url': legal[1], 'title': '404', 'content': '1 2 3'},
    ])
    write_contents(data_root, 'en', 'not-legal', [
        {'url': not_legal[0], 'title': 'Shoes', 'content': 'Running shoes.'},
    ])

    pages, features = load_pages('en')

    assert [p['url'] for p in pages] == [legal[0], not_legal[0]]
    assert all(features)
    assert 'Skipped 1 page(s) without tokens' in capsys.readouterr().out


def test_load_pages_needs_both_labels(data_root: Path):
    write_urls(data_root, 'en', 'legal', ['https://a.example/terms'])
    write_urls(data_root, 'en', 'not-legal', ['https://a.example/empty'])
    write_contents(data_root, 'en', 'legal', [
        {'url': 'https://a.example/terms', 'content': 'These terms apply.'},
    ])
    write_contents(data_root, 'en', 'not-legal', [
        {'url': 'https://a.example/empty', 'content': '1 2 3'},
    ])

    with pytest.raises(TrainingError, match='one legal and one not-legal'):
        load_pages('en')


# Dropping rare features


def test_drop_rare_features_counts_sites_not_pages():
    pages = [
        {'url': f'https://{host}/{n}'}
        for n, host in enumerate([
            'policies.google.com', 'support.google.com', 'a.com', 'b.com',
        ])
    ]
    features = [
        {'privacy': 1.0, 'google': 1.0},
        {'privacy': 0.5, 'google': 1.0},
        {'privacy': 0.25},
        {'privacy': 0.75, 'cart': 1.0},
    ]

    kept, summary = drop_rare_features(pages, features, min_sites=3)

    # google is on 2 pages but 1 site. The kept values are unchanged.
    assert kept == [
        {'privacy': 1.0}, {'privacy': 0.5}, {'privacy': 0.25}, {'privacy': 0.75},
    ]
    assert summary == '1 of 3 features are on 3 or more of the 3 sites'


def test_drop_rare_features_fails_when_nothing_is_common():
    with pytest.raises(TrainingError, match='No feature is on 2 or more sites'):
        drop_rare_features(
            [{'url': 'https://a.com'}, {'url': 'https://b.com'}],
            [{'a': 1.0}, {'b': 1.0}],
            min_sites=2,
        )


# Fitting and exporting


def test_fit_drops_brands_and_learns_the_labels():
    pages, features = synthetic_pages()
    model = fit(pages, features, Options(min_sites=3))
    names = set(model.vectorizer.get_feature_names_out())

    assert not any(name.startswith('brand') for name in names)

    p = model.predict(features)
    labels = np.array([page['label'] for page in pages])

    assert p[labels == 1].min() > 0.5 > p[labels == 0].max()


def test_fit_keeps_only_the_strongest_weights():
    pages, features = synthetic_pages()
    model = fit(pages, features, Options(min_sites=3, max_weights=4))

    assert len(model.vectorizer.get_feature_names_out()) == 4
    assert model.summary.endswith('and the 4 strongest are kept')


def test_fit_rounds_the_weights_to_4_significant_digits():
    pages, features = synthetic_pages()
    model = fit(pages, features, Options(min_sites=3))

    for weight in model.classifier.coef_[0]:
        assert float(f'{weight:.4g}') == weight


def test_export_writes_bias_and_weights_strongest_legal_first(tmp_path: Path):
    pages, features = synthetic_pages()
    model = fit(pages, features, Options(min_sites=3))
    path = tmp_path / 'xx.json'

    weights = export(model, path)
    text = path.read_text(encoding='utf-8')
    payload = json.loads(text)

    assert list(payload) == ['bias', 'weights']
    assert payload['weights'] == weights
    assert 0 not in weights.values()

    ranked = list(weights.items())

    assert ranked == sorted(ranked, key=lambda item: (-item[1], item[0]))
    assert ranked[0][1] > 0 > ranked[-1][1]

    # Readable Unicode, tab-indented, with a final newline.
    assert '"§"' in text
    assert '\n\t"bias"' in text
    assert text.endswith('}\n')


def test_export_is_byte_identical_between_runs(tmp_path: Path):
    pages, features = synthetic_pages()

    export(fit(pages, features, Options(min_sites=3)), tmp_path / 'a.json')
    export(fit(pages, features, Options(min_sites=3)), tmp_path / 'b.json')

    assert (tmp_path / 'a.json').read_bytes() == (tmp_path / 'b.json').read_bytes()


def test_exported_weights_give_the_same_p_as_the_model(tmp_path: Path):
    """The library computes sigmoid(bias + Σ weight × value) from the file, so
    the file must reproduce exactly what train.py and evaluate.py report."""

    pages, features = synthetic_pages()
    model = fit(pages, features, Options(min_sites=3))
    path = tmp_path / 'xx.json'

    export(model, path)

    payload = json.loads(path.read_text(encoding='utf-8'))

    def p(page_features: dict[str, float]) -> float:
        z = payload['bias'] + sum(
            payload['weights'].get(name, 0) * value
            for name, value in page_features.items()
        )

        return 1 / (1 + math.exp(-z))

    expected = model.predict(features)

    assert [p(f) for f in features] == pytest.approx(expected, abs=1e-12)


# Options


def test_positive_int_and_float_reject_zero_and_below():
    assert positive_int('5') == 5
    assert positive_float('0.5') == 0.5

    for parse, value in ((positive_int, '0'), (positive_float, '0'),
                         (positive_float, '-1'), (positive_float, 'nan')):
        with pytest.raises(argparse.ArgumentTypeError):
            parse(value)
