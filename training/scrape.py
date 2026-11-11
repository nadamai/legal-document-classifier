"""Scrape the page texts for each given language.

For every language, opens each URL from training/data/urls/<lang>/legal.txt
and not-legal.txt in headless Chromium, runs the package's own extractPage
(dist/extractor.iife.js) on the rendered page and appends the result to
training/data/contents/<lang>/legal.csv and not-legal.csv.

URLs already in a CSV are skipped, so a stopped run continues where it ended.
Delete the CSVs to scrape from scratch. Pages are skipped when robots.txt
disallows them (for this scraper or for common AI-training crawlers), when
they reserve text and data mining (tdm-reservation), and when they fail to
load, return an error, show a robot check or redirect to a home, consent or
login page.

Usage: training/.venv/bin/python training/scrape.py [lang ...]   (default: en)
"""

from __future__ import annotations

import asyncio
import csv
import json
import re
import sys
from collections import defaultdict
from itertools import zip_longest
from pathlib import Path
from urllib.parse import urlsplit

from playwright.async_api import Browser, BrowserContext
from playwright.async_api import Error as PlaywrightError
from playwright.async_api import Page, Response
from playwright.async_api import TimeoutError as PlaywrightTimeoutError
from playwright.async_api import async_playwright
from protego import Protego

from common import (
    CONTENTS,
    CSV_DELIMITER,
    CSV_FIELDS,
    LABELS,
    ROOT,
    URLS,
    LanguageError,
    read_urls,
    run_languages,
)

EXTRACTOR = ROOT / 'dist' / 'extractor.iife.js'

WORKERS = 4
VIEWPORT = {'width': 1920, 'height': 1080}

NAVIGATION_TIMEOUT_MS = 30_000
NETWORK_IDLE_TIMEOUT_MS = 10_000
SETTLE_DELAY_MS = 2_000

MIN_CONTENT_LENGTH = 200

# Robot checks and error pages are short. On longer pages these signs are
# ordinary text, as when a privacy policy mentions reCAPTCHA.
MAX_ERROR_PAGE_LENGTH = 1_500

BLOCK_PAGE_SELECTOR = ', '.join([
    '#challenge-form',
    '#challenge-stage',
    '#challenge-running',
    '#cf-challenge-running',
    '#px-captcha',
    'iframe[src*="captcha-delivery.com"]',
])

CAPTCHA_SELECTOR = ', '.join([
    'iframe[src*="recaptcha"]',
    'iframe[src*="hcaptcha.com"]',
    'iframe[src*="challenges.cloudflare.com"]',
    '.g-recaptcha',
    '.h-captcha',
    '.cf-turnstile',
])

ERROR_PAGE_PHRASES = re.compile(
    r'just a moment|jeszcze chwil|attention required|security check'
    r'|verify(ing)? (that )?you are (a )?human|checking your browser'
    r'|are you a robot|robot or human|pardon our interruption|captcha'
    r'|access denied|request unsuccessful|unusual traffic'
    r'|czy jesteś robotem|jesteś człowiekiem'
    r'|\b404\b|not found|nie znaleziono|nie istnieje',
    re.IGNORECASE,
)

# A dead link that lands on a consent wall or a login form would otherwise be
# saved under the original URL's label.
REDIRECT_TRAP = re.compile(
    r'consent|log-?in|sign-?in|logowanie|captcha|/sorry/', re.IGNORECASE
)

ROBOTS_USER_AGENT = 'LegalDocumentClassifier'

# Most sites opt out of AI training by disallowing these crawlers, which is a
# text-and-data-mining reservation too.
AI_TRAINING_USER_AGENTS = (
    'GPTBot',
    'ClaudeBot',
    'anthropic-ai',
    'Google-Extended',
    'Applebot-Extended',
    'CCBot',
    'meta-externalagent',
)

ROBOTS_TIMEOUT_MS = 10_000

TDM_RESERVATION_META = 'meta[name="tdm-reservation"][content="1"]'

MARKER_SELECTORS = (
    BLOCK_PAGE_SELECTOR,
    CAPTCHA_SELECTOR,
    TDM_RESERVATION_META,
)

MARKERS = '[' + ', '.join(
    f'document.querySelector({json.dumps(selector)}) !== null'
    for selector in MARKER_SELECTORS
) + ']'


class Skip(Exception):
    pass


class Robots:
    """robots.txt rules per origin, fetched once per run."""

    def __init__(self, context: BrowserContext):
        self.context = context
        self.origins: dict[str, asyncio.Task[Protego | None]] = {}

    async def check(self, url: str):
        parts = urlsplit(url)
        origin = f'{parts.scheme}://{parts.netloc}'

        if origin not in self.origins:
            self.origins[origin] = asyncio.create_task(self.fetch(origin))

        rules = await self.origins[origin]

        if rules is None:
            return

        for user_agent in (ROBOTS_USER_AGENT, *AI_TRAINING_USER_AGENTS):
            if not rules.can_fetch(url, user_agent):
                raise Skip(f'robots.txt disallows it for {user_agent}')

    # As in RFC 9309: a missing robots.txt (4xx) allows everything, and an
    # unreachable one (5xx, 429, a network error) disallows everything.
    async def fetch(self, origin: str) -> Protego | None:
        try:
            response = await self.context.request.get(
                f'{origin}/robots.txt', timeout=ROBOTS_TIMEOUT_MS
            )
        except PlaywrightError as error:
            reason = first_line(error)

            raise Skip(f'robots.txt unreachable: {reason}') from None

        if response.status == 429 or response.status >= 500:
            raise Skip(f'robots.txt unreachable: HTTP {response.status}')

        if response.status >= 400:
            return None

        body = await response.body()

        return Protego.parse(body.decode('utf-8', errors='replace'))



def scraped_urls(path: Path) -> set[str]:
    if not path.exists():
        return set()

    with path.open(newline='', encoding='utf-8') as file:
        reader = csv.DictReader(file, delimiter=CSV_DELIMITER)

        return {row['url'] for row in reader}


# Parallel workers then rarely load the same site at once.
def interleave_by_host(urls: list[str]) -> list[str]:
    by_host: dict[str, list[str]] = defaultdict(list)

    for url in urls:
        by_host[urlsplit(url).hostname or ''].append(url)

    return [
        url
        for round_of_urls in zip_longest(*by_host.values())
        for url in round_of_urls
        if url is not None
    ]


def host_and_path(url: str) -> tuple[str, str]:
    parts = urlsplit(url)

    return (parts.hostname or '').removeprefix('www.'), parts.path.rstrip('/')


def check_response(response: Response | None):
    if response is None:
        raise Skip('no response')

    if response.status >= 400:
        raise Skip(f'HTTP {response.status}')

    if response.headers.get('tdm-reservation', '').strip() == '1':
        raise Skip('reserves text and data mining (tdm-reservation)')

    content_type = response.headers.get('content-type', '')

    if content_type and 'html' not in content_type:
        raise Skip(f'not HTML ({content_type})')


def check_redirect(url: str, final_url: str):
    host, path = host_and_path(url)
    final_host, final_path = host_and_path(final_url)

    if (final_host, final_path) == (host, path):
        return

    if final_path == '' and path != '':
        raise Skip(f'redirected to the home page {final_url}')

    if REDIRECT_TRAP.search(final_host + final_path):
        raise Skip(f'redirected to {final_url}')


def check_text(extracted: dict, has_captcha: bool):
    content = extracted['content']

    if len(content) < MIN_CONTENT_LENGTH:
        raise Skip(f'only {len(content)} characters of text')

    if len(content) > MAX_ERROR_PAGE_LENGTH:
        return

    if has_captcha:
        raise Skip('robot check')

    if ERROR_PAGE_PHRASES.search('\n'.join([extracted['title'], content])):
        raise Skip('error or robot check page')


# A world of its own, like a browser extension's content script: the page's
# scripts share the DOM, but can't replace the built-ins the expression uses.
# A page that swaps String.prototype.trim for a buggy one would otherwise
# turn headings into objects.
async def evaluate_isolated(page: Page, expression: str) -> object:
    cdp = await page.context.new_cdp_session(page)

    try:
        tree = await cdp.send('Page.getFrameTree')
        world = await cdp.send('Page.createIsolatedWorld', {
            'frameId': tree['frameTree']['frame']['id'],
            'worldName': 'extractor',
        })
        result = await cdp.send('Runtime.evaluate', {
            'expression': expression,
            'contextId': world['executionContextId'],
            'returnByValue': True,
        })
    finally:
        await cdp.detach()

    if 'exceptionDetails' in result:
        details = result['exceptionDetails']
        exception = details.get('exception', {})
        error = exception.get('description') or details['text']

        raise Skip(f'script failed: {error.splitlines()[0]}')

    return result['result'].get('value')


def is_page(value: object) -> bool:
    return (
        isinstance(value, dict)
        and all(isinstance(value.get(f), str) for f in ('title', 'content'))
        and all(
            isinstance(value.get(field), list)
            and all(isinstance(item, str) for item in value[field])
            for field in ('h1', 'h2')
        )
    )


async def scrape_page(
    context: BrowserContext, robots: Robots, url: str, extract: str
) -> dict:
    await robots.check(url)

    page = await context.new_page()

    try:
        response = await page.goto(
            url, wait_until='domcontentloaded', timeout=NAVIGATION_TIMEOUT_MS
        )

        check_response(response)

        try:
            await page.wait_for_load_state(
                'networkidle', timeout=NETWORK_IDLE_TIMEOUT_MS
            )
        except PlaywrightTimeoutError:
            pass

        await page.wait_for_timeout(SETTLE_DELAY_MS)

        check_redirect(url, page.url)

        if page.url != url:
            await robots.check(page.url)

        markers = await evaluate_isolated(page, MARKERS)

        if not isinstance(markers, list):
            raise Skip('marker check returned nothing')

        is_block_page, has_captcha, reserves_tdm = markers

        if reserves_tdm:
            raise Skip('reserves text and data mining (tdm-reservation)')

        if is_block_page:
            raise Skip('robot check')

        extracted = await evaluate_isolated(page, extract)

        if not is_page(extracted):
            raise Skip('the extractor returned something other than a page')

        check_text(extracted, has_captcha)

        return extracted
    finally:
        await page.close()


def to_row(url: str, extracted: dict) -> dict[str, str]:
    return {
        'url': url,
        'title': extracted['title'],
        'h1': '\n'.join(extracted['h1']),
        'h2': '\n'.join(extracted['h2']),
        'content': extracted['content'],
    }


def first_line(error: Exception) -> str:
    lines = str(error).strip().splitlines()

    return lines[0] if lines else type(error).__name__


async def scrape_label(
    context: BrowserContext,
    robots: Robots,
    urls: list[str],
    path: Path,
    extract: str,
):
    done = scraped_urls(path)
    todo = interleave_by_host([url for url in urls if url not in done])
    name = path.relative_to(ROOT)

    print(f'{name}: {len(todo)} to scrape, {len(urls) - len(todo)} already in')

    if not todo:
        return

    path.parent.mkdir(parents=True, exist_ok=True)

    is_new = not path.exists() or path.stat().st_size == 0
    queue = iter(enumerate(todo, start=1))
    saved = 0

    with path.open('a', newline='', encoding='utf-8') as file:
        writer = csv.DictWriter(
            file, fieldnames=CSV_FIELDS, delimiter=CSV_DELIMITER
        )

        if is_new:
            writer.writeheader()

        async def work():
            nonlocal saved

            for number, url in queue:
                prefix = f'  [{number}/{len(todo)}]'

                try:
                    extracted = await scrape_page(
                        context, robots, url, extract
                    )
                except (Skip, PlaywrightError) as error:
                    print(
                        f'{prefix} skip {url}: {first_line(error)}', flush=True
                    )

                    continue

                writer.writerow(to_row(url, extracted))
                file.flush()

                saved += 1

                print(
                    f'{prefix} ok   {url} '
                    f'({len(extracted["content"]):,} characters)',
                    flush=True,
                )

        # Unlike gather, a failing worker cancels the others, instead of
        # leaving them to fail on the closed browser.
        async with asyncio.TaskGroup() as workers:
            for _ in range(WORKERS):
                workers.create_task(work())

    print(f'{name}: {saved} saved, {len(todo) - saved} skipped')


# Many sites turn away a HeadlessChrome user agent outright, which would skip
# pages that every visitor can read.
async def browser_user_agent(browser: Browser) -> str:
    page = await browser.new_page()
    user_agent = await page.evaluate('navigator.userAgent')

    await page.close()

    return user_agent.replace('HeadlessChrome', 'Chrome')


async def scrape_language(lang: str, extract: str):
    urls = {
        stem: read_urls(URLS / lang / f'{stem}.txt') for stem in LABELS
    }

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel='chromium')

        try:
            context = await browser.new_context(
                locale=lang,
                viewport=VIEWPORT,
                user_agent=await browser_user_agent(browser),
                accept_downloads=False,
            )
            robots = Robots(context)

            for stem, label_urls in urls.items():
                await scrape_label(
                    context,
                    robots,
                    label_urls,
                    CONTENTS / lang / f'{stem}.csv',
                    extract,
                )
        finally:
            await browser.close()


def scrape_languages(languages: list[str]):
    if not EXTRACTOR.exists():
        sys.exit(f'Missing {EXTRACTOR.relative_to(ROOT)}. Run npm run build.')

    extract = (
        '(() => { '
        + EXTRACTOR.read_text(encoding='utf-8')
        + '\nreturn LegalDocumentExtractor.extractPage(document); })()'
    )

    try:
        run_languages(
            languages,
            lambda lang: asyncio.run(scrape_language(lang, extract)),
            'Scraping',
        )
    except KeyboardInterrupt:
        sys.exit('\nStopped. Run it again to continue where it ended.')


def main():
    scrape_languages(sys.argv[1:] or ['en'])


if __name__ == '__main__':
    main()
