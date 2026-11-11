"""scrape_page end to end: headless Chromium, the built dist/extractor.iife.js
and hand-written pages from a local server. Needs `npm run build` and
Playwright's Chromium (`npm run train:setup`)."""

from __future__ import annotations

import asyncio
import threading
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
from playwright.async_api import async_playwright

import scrape
from scrape import EXTRACTOR, Robots, Skip, scrape_page

POLICY_TEXT = (
    'Example Store Ltd is the controller of your personal data. We collect '
    'your name, email address and delivery address when you place an order. '
    'You have the right to access, correct or delete your personal data, and '
    'to withdraw your consent at any time. '
) * 3

POLICY = f"""<!doctype html>
<title>Privacy Policy | Example Store</title>
<nav><a href="/">Home</a> <a href="/shop">Shop</a></nav>
<main>
    <h1>Privacy Policy</h1>
    <h2>What we collect</h2>
    <p>{POLICY_TEXT}</p>
    <h2>Your rights</h2>
    <p>{POLICY_TEXT}</p>
</main>
<footer>© Example Store</footer>"""

TDM_META = POLICY.replace(
    '<title>', '<meta name="tdm-reservation" content="1"><title>'
)

ROBOT_CHECK = """<!doctype html>
<title>Just a moment...</title>
<div id="challenge-stage"><p>Checking your browser before accessing.</p></div>"""

PAGES: dict[str, tuple[int, dict[str, str], str]] = {
    '/robots.txt': (200, {}, 'User-agent: GPTBot\nDisallow: /private/\n'),
    '/privacy': (200, {}, POLICY),
    '/private/privacy': (200, {}, POLICY),
    '/tdm-meta': (200, {}, TDM_META),
    '/tdm-header': (200, {'tdm-reservation': '1'}, POLICY),
    '/robot-check': (200, {}, ROBOT_CHECK),
    '/missing': (404, {}, POLICY),
    '/old-terms': (302, {'location': '/'}, ''),
    '/moved-privacy': (301, {'location': '/private/privacy'}, ''),
    '/': (200, {}, '<!doctype html><title>Home</title><p>Welcome</p>'),
}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        status, headers, body = PAGES.get(self.path, (404, {}, 'Not found'))
        content_type = (
            'text/plain' if self.path.endswith('.txt') else 'text/html'
        )

        self.send_response(status)
        self.send_header('content-type', f'{content_type}; charset=utf-8')

        for name, value in headers.items():
            self.send_header(name, value)

        self.end_headers()
        self.wfile.write(body.encode('utf-8'))

    def log_message(self, format: str, *args: object):
        pass


@pytest.fixture(scope='module')
def origin() -> Iterator[str]:
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)

    thread.start()

    yield f'http://127.0.0.1:{server.server_address[1]}'

    server.shutdown()


@pytest.fixture(scope='module')
def extract() -> str:
    if not EXTRACTOR.exists():
        pytest.fail('Missing dist/extractor.iife.js. Run npm run build.')

    return (
        '(() => { '
        + EXTRACTOR.read_text(encoding='utf-8')
        + '\nreturn LegalDocumentExtractor.extractPage(document); })()'
    )


@pytest.fixture(autouse=True)
def no_waiting(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(scrape, 'SETTLE_DELAY_MS', 0)
    monkeypatch.setattr(scrape, 'NETWORK_IDLE_TIMEOUT_MS', 1_000)


def scrape_url(url: str, extract: str) -> dict:
    async def run() -> dict:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(channel='chromium')

            try:
                context = await browser.new_context()

                return await scrape_page(context, Robots(context), url, extract)
            finally:
                await browser.close()

    return asyncio.run(run())


def test_scrapes_the_main_text_with_the_package_extractor(
    origin: str, extract: str
):
    extracted = scrape_url(f'{origin}/privacy', extract)

    assert extracted['title'] == 'Privacy Policy | Example Store'
    assert extracted['h1'] == ['Privacy Policy']
    assert extracted['h2'] == ['What we collect', 'Your rights']
    assert 'controller of your personal data' in extracted['content']
    assert 'Shop' not in extracted['content']
    assert '©' not in extracted['content']


@pytest.mark.parametrize(
    ('path', 'reason'),
    [
        ('/private/privacy', 'robots.txt disallows it for GPTBot'),
        ('/moved-privacy', 'robots.txt disallows it for GPTBot'),
        ('/tdm-meta', 'tdm-reservation'),
        ('/tdm-header', 'tdm-reservation'),
        ('/robot-check', 'robot check'),
        ('/missing', 'HTTP 404'),
        ('/old-terms', 'redirected to the home page'),
    ],
)
def test_skips_pages_it_may_not_or_should_not_keep(
    origin: str, extract: str, path: str, reason: str
):
    with pytest.raises(Skip, match=reason):
        scrape_url(f'{origin}{path}', extract)
