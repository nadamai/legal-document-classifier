from __future__ import annotations

from pathlib import Path

import pytest

from common import (
    LanguageError,
    check_language,
    language_folders,
    read_urls,
    run_languages,
    site_of,
    with_scheme,
)


def test_with_scheme_adds_https_only_when_missing():
    assert with_scheme('example.com/terms') == 'https://example.com/terms'
    assert with_scheme('http://example.com') == 'http://example.com'


def test_read_urls_strips_dedupes_and_keeps_order(tmp_path: Path):
    path = tmp_path / 'legal.txt'
    path.write_text(
        '  example.com/terms \n\nhttps://b.example/privacy\n'
        'https://example.com/terms\n\n',
        encoding='utf-8',
    )

    assert read_urls(path) == [
        'https://example.com/terms',
        'https://b.example/privacy',
    ]


def test_read_urls_fails_the_language_for_a_missing_list(data_root: Path):
    with pytest.raises(LanguageError, match='Missing'):
        read_urls(data_root / 'training' / 'data' / 'urls' / 'en' / 'legal.txt')


@pytest.mark.parametrize(
    ('url', 'site'),
    [
        ('https://policies.google.com/privacy', 'google.com'),
        ('https://support.google.com/terms', 'google.com'),
        ('google.com', 'google.com'),
        ('https://shop.example.com.pl/regulamin', 'example.com.pl'),
        ('https://other.com.pl/regulamin', 'other.com.pl'),
        ('https://alice.github.io/privacy', 'alice.github.io'),
        ('https://bob.github.io/privacy', 'bob.github.io'),
        ('https://www.example.co.uk:8443/terms', 'example.co.uk'),
        ('http://192.168.1.10/terms', '192.168.1.10'),
    ],
)
def test_site_of_is_the_registrable_domain(url: str, site: str):
    assert site_of(url) == site


@pytest.mark.parametrize('lang', ['en', 'pl', 'pt-BR', 'zh-Hant', 'fil'])
def test_check_language_accepts_codes(lang: str):
    check_language(lang)


@pytest.mark.parametrize(
    'lang', ['', 'e', 'EN', 'en_US', 'english', '../en', 'en/../pl', 'en-']
)
def test_check_language_rejects_anything_else(lang: str):
    with pytest.raises(LanguageError):
        check_language(lang)


def test_language_folders_skips_non_codes(
    data_root: Path, capsys: pytest.CaptureFixture[str]
):
    parent = data_root / 'training' / 'data' / 'urls'

    for name in ('pl', 'en', 'Backup', 'notes'):
        (parent / name).mkdir(parents=True)

    (parent / 'README.txt').write_text('', encoding='utf-8')

    assert language_folders(parent) == ['en', 'pl']
    assert 'Skipping training/data/urls/Backup' in capsys.readouterr().out


def test_language_folders_exits_without_any_language(data_root: Path):
    parent = data_root / 'training' / 'data' / 'urls'

    (parent / 'Backup').mkdir(parents=True)

    with pytest.raises(SystemExit, match='No language folders'):
        language_folders(parent)


def test_run_languages_runs_the_rest_after_a_failure():
    ran = []

    def run(lang: str):
        ran.append(lang)

        if lang == 'en':
            raise LanguageError('broken')

    with pytest.raises(SystemExit, match='Scraping failed for: en, x_y'):
        run_languages(['en', 'pl', 'en', 'x_y', 'de'], run, 'Scraping')

    # Each language once, and an invalid code fails without running.
    assert ran == ['en', 'pl', 'de']


def test_run_languages_returns_when_every_language_succeeds():
    ran = []

    run_languages(['en', 'pl'], ran.append, 'Training')

    assert ran == ['en', 'pl']
