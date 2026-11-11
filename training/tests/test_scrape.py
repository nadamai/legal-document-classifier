"""Unit tests of the scraping rules, without a browser or network: robots.txt
and tdm-reservation checks are what keep the scraping within the EU text and
data mining exception (docs/data-and-licensing.md#scraping)."""

from __future__ import annotations

import asyncio
import csv
from pathlib import Path

import pytest
from playwright.async_api import Error as PlaywrightError

import scrape
from common import CSV_DELIMITER, CSV_FIELDS
from scrape import (
    AI_TRAINING_USER_AGENTS,
    MAX_ERROR_PAGE_LENGTH,
    MIN_CONTENT_LENGTH,
    ROBOTS_USER_AGENT,
    Robots,
    Skip,
    check_redirect,
    check_response,
    check_text,
    interleave_by_host,
    is_page,
    scrape_label,
    scraped_urls,
    to_row,
)
from train import read_pages
from helpers import write_urls

LONG_TEXT = 'The terms of this agreement apply to every order. ' * 40


class FakeResponse:
    def __init__(
        self,
        status: int = 200,
        body: str = '',
        headers: dict[str, str] | None = None,
    ):
        self.status = status
        self.headers = headers or {}
        self._body = body.encode('utf-8')

    async def body(self) -> bytes:
        return self._body


class FakeRequest:
    def __init__(self, responses: dict[str, FakeResponse | Exception]):
        self.responses = responses
        self.fetched: list[str] = []

    async def get(self, url: str, timeout: float) -> FakeResponse:
        self.fetched.append(url)
        response = self.responses.get(url, FakeResponse(404))

        if isinstance(response, Exception):
            raise response

        return response


class FakeContext:
    def __init__(self, responses: dict[str, FakeResponse | Exception]):
        self.request = FakeRequest(responses)


def check_robots(
    responses: dict[str, FakeResponse | Exception], *urls: str
) -> FakeContext:
    context = FakeContext(responses)

    async def run():
        robots = Robots(context)

        for url in urls:
            await robots.check(url)

    asyncio.run(run())

    return context


def robots_txt(body: str) -> dict[str, FakeResponse | Exception]:
    return {'https://example.com/robots.txt': FakeResponse(200, body)}


# robots.txt


def test_robots_allows_a_page_that_no_rule_disallows():
    check_robots(
        robots_txt('User-agent: *\nDisallow: /admin/\n'),
        'https://example.com/terms',
    )


def test_robots_skips_a_page_disallowed_for_every_crawler():
    with pytest.raises(Skip, match=ROBOTS_USER_AGENT):
        check_robots(
            robots_txt('User-agent: *\nDisallow: /legal/\n'),
            'https://example.com/legal/terms',
        )


def test_robots_skips_a_page_disallowed_for_this_scraper():
    with pytest.raises(Skip, match=ROBOTS_USER_AGENT):
        check_robots(
            robots_txt(f'User-agent: {ROBOTS_USER_AGENT}\nDisallow: /\n'),
            'https://example.com/terms',
        )


@pytest.mark.parametrize('user_agent', AI_TRAINING_USER_AGENTS)
def test_robots_skips_a_page_disallowed_for_an_ai_crawler(user_agent: str):
    with pytest.raises(Skip, match=user_agent):
        check_robots(
            robots_txt(f'User-agent: {user_agent}\nDisallow: /\n'),
            'https://example.com/terms',
        )


def test_robots_allows_everything_when_robots_txt_is_missing():
    check_robots(
        {'https://example.com/robots.txt': FakeResponse(404)},
        'https://example.com/terms',
    )


@pytest.mark.parametrize('status', [429, 500, 503])
def test_robots_skips_when_robots_txt_is_unreachable(status: int):
    with pytest.raises(Skip, match=f'unreachable: HTTP {status}'):
        check_robots(
            {'https://example.com/robots.txt': FakeResponse(status)},
            'https://example.com/terms',
        )


def test_robots_skips_when_robots_txt_fails_to_load():
    with pytest.raises(Skip, match='unreachable: net::ERR_CONNECTION_RESET'):
        check_robots(
            {
                'https://example.com/robots.txt': PlaywrightError(
                    'net::ERR_CONNECTION_RESET\nCall log: …'
                )
            },
            'https://example.com/terms',
        )


def test_robots_fetches_robots_txt_once_per_origin():
    context = check_robots(
        robots_txt('User-agent: *\nAllow: /\n'),
        'https://example.com/terms',
        'https://example.com/privacy',
        'https://shop.example.com/terms',
    )

    assert context.request.fetched == [
        'https://example.com/robots.txt',
        'https://shop.example.com/robots.txt',
    ]


# Page responses


def test_check_response_skips_a_missing_response():
    with pytest.raises(Skip, match='no response'):
        check_response(None)


@pytest.mark.parametrize('status', [403, 404, 500])
def test_check_response_skips_errors(status: int):
    with pytest.raises(Skip, match=f'HTTP {status}'):
        check_response(FakeResponse(status))


@pytest.mark.parametrize('value', ['1', ' 1 '])
def test_check_response_skips_a_tdm_reservation_header(value: str):
    with pytest.raises(Skip, match='tdm-reservation'):
        check_response(FakeResponse(headers={'tdm-reservation': value}))


@pytest.mark.parametrize(
    'headers',
    [
        {},
        {'tdm-reservation': '0'},
        {'content-type': 'text/html; charset=utf-8'},
        {'content-type': 'application/xhtml+xml'},
    ],
)
def test_check_response_accepts_an_html_page(headers: dict[str, str]):
    check_response(FakeResponse(headers=headers))


def test_check_response_skips_anything_but_html():
    with pytest.raises(Skip, match='not HTML'):
        check_response(FakeResponse(headers={'content-type': 'application/pdf'}))


# Redirects


@pytest.mark.parametrize(
    'final_url',
    [
        'https://example.com/terms',
        'https://www.example.com/terms/',
        'https://example.com/terms?lang=en',
        'https://example.com/legal/terms-of-service',
    ],
)
def test_check_redirect_accepts_the_same_or_another_page(final_url: str):
    check_redirect('https://example.com/terms', final_url)


def test_check_redirect_accepts_a_home_page_that_stays_home():
    check_redirect('https://example.com', 'https://www.example.com/')


@pytest.mark.parametrize(
    ('final_url', 'reason'),
    [
        ('https://example.com/', 'home page'),
        ('https://consent.example.com/terms', 'redirected to'),
        ('https://example.com/login?next=/terms', 'redirected to'),
        ('https://example.com/sign-in', 'redirected to'),
        ('https://example.com/logowanie', 'redirected to'),
    ],
)
def test_check_redirect_skips_a_trap(final_url: str, reason: str):
    with pytest.raises(Skip, match=reason):
        check_redirect('https://example.com/terms', final_url)


# Extracted text


def page(content: str, title: str = 'Terms of Service') -> dict:
    return {'title': title, 'content': content, 'h1': [], 'h2': []}


def test_check_text_skips_a_page_with_too_little_text():
    with pytest.raises(Skip, match='characters of text'):
        check_text(page('x' * (MIN_CONTENT_LENGTH - 1)), False)


def test_check_text_skips_a_short_page_with_a_captcha():
    with pytest.raises(Skip, match='robot check'):
        check_text(page('a' * MIN_CONTENT_LENGTH), True)


@pytest.mark.parametrize(
    ('title', 'content'),
    [
        ('Just a moment...', 'Checking the site connection security.'),
        ('Error', 'Page not found. Try the search instead.'),
        ('404', 'Sorry, there is nothing here.'),
        ('Błąd', 'Strona nie istnieje. Wróć na stronę główną.'),
    ],
)
def test_check_text_skips_a_short_error_page(title: str, content: str):
    with pytest.raises(Skip, match='error or robot check'):
        check_text(page(content.ljust(MIN_CONTENT_LENGTH, '.'), title), False)


def test_check_text_accepts_a_long_page_that_mentions_a_captcha():
    content = LONG_TEXT + 'This site is protected by reCAPTCHA.'

    assert len(content) > MAX_ERROR_PAGE_LENGTH

    check_text(page(content), True)


# Helpers


def test_interleave_by_host_alternates_sites_and_keeps_their_order():
    urls = [
        'https://a.example/1',
        'https://a.example/2',
        'https://a.example/3',
        'https://b.example/1',
        'https://c.example/1',
        'https://c.example/2',
    ]

    assert interleave_by_host(urls) == [
        'https://a.example/1',
        'https://b.example/1',
        'https://c.example/1',
        'https://a.example/2',
        'https://c.example/2',
        'https://a.example/3',
    ]


@pytest.mark.parametrize(
    ('value', 'expected'),
    [
        ({'title': 't', 'content': 'c', 'h1': ['a'], 'h2': []}, True),
        ({'title': 't', 'content': 'c', 'h1': [], 'h2': [1]}, False),
        ({'title': 't', 'content': 'c', 'h1': 'a', 'h2': []}, False),
        ({'title': None, 'content': 'c', 'h1': [], 'h2': []}, False),
        ({'title': 't', 'h1': [], 'h2': []}, False),
        (['t', 'c'], False),
        (None, False),
    ],
)
def test_is_page_checks_the_extractor_result(value: object, expected: bool):
    assert is_page(value) is expected


def test_to_row_puts_one_heading_per_line():
    extracted = {
        'title': 'Terms',
        'content': 'Text',
        'h1': ['Terms of Service'],
        'h2': ['Orders', 'Returns'],
    }

    assert to_row('https://example.com/terms', extracted) == {
        'url': 'https://example.com/terms',
        'title': 'Terms',
        'h1': 'Terms of Service',
        'h2': 'Orders\nReturns',
        'content': 'Text',
    }


def test_scraped_urls_of_a_missing_file_is_empty(tmp_path: Path):
    assert scraped_urls(tmp_path / 'legal.csv') == set()


# Resuming and the CSV format


def test_scrape_label_continues_where_it_ended_and_train_reads_it_back(
    data_root: Path, monkeypatch: pytest.MonkeyPatch
):
    urls = [
        'https://example.com/terms',
        'https://example.com/privacy',
        'https://shop.example/rules',
    ]
    scraped: list[str] = []

    async def fake_scrape_page(context, robots, url: str, extract: str):
        scraped.append(url)

        if url == 'https://shop.example/rules':
            raise Skip('robots.txt disallows it for GPTBot')

        return {
            'title': f'Title; "{url}"',
            'content': 'First line; with a delimiter\nSecond line',
            'h1': ['Terms'],
            'h2': ['Orders', 'Returns'],
        }

    monkeypatch.setattr(scrape, 'scrape_page', fake_scrape_page)

    path = data_root / 'training' / 'data' / 'contents' / 'en' / 'legal.csv'

    def run(todo: list[str]):
        asyncio.run(scrape_label(None, None, todo, path, 'extract'))

    run(urls[:1])
    run(urls)

    # The first URL was saved in the first run, so only the rest ran again,
    # and a skipped page is never written.
    assert sorted(scraped) == sorted([urls[0], urls[1], urls[2]])
    assert scraped.count(urls[0]) == 1
    assert scraped_urls(path) == {urls[0], urls[1]}

    with path.open(newline='', encoding='utf-8') as file:
        reader = csv.reader(file, delimiter=CSV_DELIMITER)

        assert next(reader) == list(CSV_FIELDS)
        assert all(row != list(CSV_FIELDS) for row in reader)

    write_urls(data_root, 'en', 'legal', urls)
    write_urls(data_root, 'en', 'not-legal', [])
    (path.parent / 'not-legal.csv').write_text(
        ';'.join(CSV_FIELDS) + '\n', encoding='utf-8'
    )

    pages = read_pages('en')

    assert [p['url'] for p in pages] == urls[:2]
    assert pages[0] == {
        'url': urls[0],
        'label': 1,
        'content': 'First line; with a delimiter\nSecond line',
        'title': f'Title; "{urls[0]}"',
        'h1': ['Terms'],
        'h2': ['Orders', 'Returns'],
    }
