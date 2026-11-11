import { describe, expect, it } from 'vitest';
import { extractPage } from '~/src/extraction/extractPage';
import type { Page } from '~/src/types/Page';
import { renderPage } from '~/test/common/renderPage';

const LONG_TEXT: string =
	'These terms govern your use of the service and explain your rights. '.repeat(
		20
	);

function extract(html: string): Promise<Page> {
	return renderPage(html, extractPage);
}

describe('extractPage: root', () => {
	it('reads only the single <main> when it holds most of the text', async () => {
		const page: Page = await extract(
			`<nav>Menu</nav><main><h1>Terms</h1><p>${LONG_TEXT}</p></main><div>Promo outside main</div>`
		);

		expect(page.h1).toEqual(['Terms']);
		expect(page.content.startsWith('Terms\n')).toBe(true);
		expect(page.content).not.toContain('Promo outside main');
		expect(page.content).not.toContain('Menu');
	});

	it('accepts [role="main"]', async () => {
		const page: Page = await extract(
			`<div role="main"><p>${LONG_TEXT}</p></div><div>Outside</div>`
		);

		expect(page.content).not.toContain('Outside');
	});

	it('falls back to <body> when <main> holds under a quarter of the text', async () => {
		const page: Page = await extract(
			`<main><p>Short main</p></main><div><p>${LONG_TEXT}</p></div>`
		);

		expect(page.content).toContain('Short main');
		expect(page.content).toContain('These terms govern');
	});

	it('falls back to <body> when there are several <main> elements', async () => {
		const page: Page = await extract(
			`<main><p>${LONG_TEXT}</p></main><main><p>Second main</p></main><div>Outside</div>`
		);

		expect(page.content).toContain('Second main');
		expect(page.content).toContain('Outside');
	});

	it('returns empty fields for an empty body, but keeps the title', async () => {
		expect(await extract('<title>  Empty   page </title>')).toEqual({
			content: '',
			title: 'Empty page',
			h1: [],
			h2: []
		});
	});
});

describe('extractPage: excluded elements', () => {
	it.each([
		['nav', '<nav>Excluded</nav>'],
		['aside', '<aside>Excluded</aside>'],
		['an open dialog', '<dialog open>Excluded</dialog>'],
		['role="banner"', '<div role="banner">Excluded</div>'],
		['role="navigation"', '<div role="navigation">Excluded</div>'],
		['role="contentinfo"', '<div role="contentinfo">Excluded</div>'],
		['role="complementary"', '<div role="complementary">Excluded</div>'],
		['role="dialog"', '<div role="dialog">Excluded</div>'],
		['role="alertdialog"', '<div role="alertdialog">Excluded</div>'],
		['aria-modal="true"', '<div aria-modal="true">Excluded</div>'],
		['a page-level header', '<header>Excluded</header>'],
		['a page-level footer', '<footer>Excluded</footer>'],
		['OneTrust', '<div id="onetrust-consent-sdk">Excluded</div>'],
		['Cookiebot', '<div id="CybotCookiebotDialog">Excluded</div>'],
		['Cookie Consent', '<div class="cc-window">Excluded</div>'],
		['Klaro', '<div class="klaro">Excluded</div>'],
		[
			'a banner-named element',
			'<div class="site-cookie-banner">Excluded</div>'
		],
		['a consent bar', '<div id="consent-bar">Excluded</div>'],
		['a ligature icon', '<span class="material-icons">Excluded</span>'],
		['a symbol icon', '<i class="material-symbols-outlined">Excluded</i>'],
		['a fixed overlay', '<div style="position: fixed; top: 0">Excluded</div>'],
		[
			'a sticky bar',
			'<section style="position: sticky; top: 0">Excluded</section>'
		],
		[
			'a fixed custom element',
			'<promo-bar style="position: fixed; display: block">Excluded</promo-bar>'
		]
	])('drops %s', async (_name: string, element: string) => {
		const page: Page = await extract(`${element}<p>${LONG_TEXT}</p>`);

		expect(page.content).not.toContain('Excluded');
		expect(page.content).toContain('These terms govern');
	});

	it('keeps a header and footer inside sectioning content', async () => {
		const page: Page = await extract(
			`<article><header>Article heading block</header><p>${LONG_TEXT}</p><footer>Section footnote</footer></article>`
		);

		expect(page.content).toContain('Article heading block');
		expect(page.content).toContain('Section footnote');
	});

	it("keeps a cookie policy's own cookie table", async () => {
		const page: Page = await extract(
			`<p>${LONG_TEXT}</p><table class="cookie-table"><tr><td>session_id</td></tr></table>`
		);

		expect(page.content).toContain('session_id');
	});

	it('keeps a fixed container that holds most of the page', async () => {
		const page: Page = await extract(
			`<div style="position: fixed; inset: 0; overflow: auto"><p>${LONG_TEXT}</p></div><div>Small</div>`
		);

		expect(page.content).toContain('These terms govern');
	});

	it('keeps a banner-named element that holds most of the page', async () => {
		const page: Page = await extract(
			`<div class="consent-modal"><p>${LONG_TEXT}</p></div><p>Small</p>`
		);

		expect(page.content).toContain('These terms govern');
	});

	it('checks only containers for fixed positioning', async () => {
		const page: Page = await extract(
			`<p style="position: fixed">Fixed paragraph</p><p>${LONG_TEXT}</p>`
		);

		expect(page.content).toContain('Fixed paragraph');
	});

	it('keeps aria-hidden content', async () => {
		const page: Page = await extract(
			`<div aria-hidden="true"><p>${LONG_TEXT}</p></div>`
		);

		expect(page.content).toContain('These terms govern');
	});
});

describe('extractPage: sidebar fallback', () => {
	it('reads an aside that holds the whole content', async () => {
		const page: Page = await extract(
			`<header><nav>Shop Contact</nav></header><aside id="content"><h1>Terms of service</h1><h2>Orders</h2><p>${LONG_TEXT}</p></aside><footer>Copyright</footer>`
		);

		expect(page.content).toContain('These terms govern');
		expect(page.h1).toEqual(['Terms of service']);
		expect(page.h2).toEqual(['Orders']);
		expect(page.content).not.toContain('Shop Contact');
		expect(page.content).not.toContain('Copyright');
	});

	it('reads an element with role="complementary" that holds the content', async () => {
		const page: Page = await extract(
			`<div role="complementary"><p>${LONG_TEXT}</p></div>`
		);

		expect(page.content).toContain('These terms govern');
	});

	it('picks the sidebar with the most visible text', async () => {
		const page: Page = await extract(
			`<aside><a href="/">Filters</a><div style="display: none">${LONG_TEXT.repeat(3)}</div></aside><aside><p>Visible policy text. ${LONG_TEXT}</p></aside>`
		);

		expect(page.content).toContain('Visible policy text.');
		expect(page.content).not.toContain('Filters');
	});

	it('still drops what is excluded inside the kept sidebar', async () => {
		const page: Page = await extract(
			`<aside><nav>Section menu</nav><p>${LONG_TEXT}</p><div class="cookie-banner">We use cookies</div></aside>`
		);

		expect(page.content).toContain('These terms govern');
		expect(page.content).not.toContain('Section menu');
		expect(page.content).not.toContain('We use cookies');
	});

	it('leaves pages with enough content unchanged', async () => {
		const page: Page = await extract(
			`<aside><p>${LONG_TEXT}</p></aside><p>${LONG_TEXT.slice(0, 300)}</p><footer>Privacy policy Terms</footer>`
		);

		expect(page.content).toBe(LONG_TEXT.slice(0, 300).trim());
	});

	it('leaves a near-empty page empty when every sidebar is short', async () => {
		const page: Page = await extract(
			'<p>Loading…</p><aside>Related: Privacy policy · Terms of service</aside>'
		);

		expect(page.content).toBe('Loading…');
	});

	it.each([
		['a page-level footer', `<footer><p>${LONG_TEXT}</p></footer>`],
		['a page-level header', `<header><p>${LONG_TEXT}</p></header>`],
		['a nav', `<nav><p>${LONG_TEXT}</p></nav>`],
		['an open dialog', `<dialog open><p>${LONG_TEXT}</p></dialog>`],
		[
			'a consent tool',
			`<div id="onetrust-consent-sdk"><p>${LONG_TEXT}</p></div>`
		]
	])('never falls back to %s', async (_name: string, element: string) => {
		const page: Page = await extract(`<p>Loading…</p>${element}`);

		expect(page.content).toBe('Loading…');
	});
});

describe('extractPage: text', () => {
	it('skips text that is not rendered', async () => {
		const page: Page = await extract(
			// Next to an excluded element, so each child is checked one by one.
			`<nav>x</nav><p>Visible</p><p style="display: none">Hidden</p><script>var scriptText = 1;</script><style>.styleText {}</style><noscript>Noscript</noscript><template>Template</template><svg><text>Svg</text></svg>`
		);

		expect(page.content).toBe('Visible');
	});

	it('collapses whitespace, drops empty lines and private-use glyphs', async () => {
		const page: Page = await extract(
			'<p>Terms    of\tservice\u{E5CA}</p><p>   </p><div><br><br></div><p>Next  line</p>'
		);

		expect(page.content).toBe('Terms of service\nNext line');
	});

	it('applies CSS text-transform, as innerText does', async () => {
		const page: Page = await extract(
			'<h1 style="text-transform: uppercase">Privacy policy</h1>'
		);

		expect(page.h1).toEqual(['PRIVACY POLICY']);
	});
});

describe('extractPage: title and headings', () => {
	it('reads the title, h1 and h2, one entry per heading, and not h3', async () => {
		const page: Page = await extract(
			'<title>Terms | Shop</title><h1>Terms</h1><h2>Orders</h2><h2>  Returns </h2><h3>Details</h3><p>Body</p>'
		);

		expect(page.title).toBe('Terms | Shop');
		expect(page.h1).toEqual(['Terms']);
		expect(page.h2).toEqual(['Orders', 'Returns']);
		expect(page).not.toHaveProperty('h3');
	});

	it('skips headings that are excluded, hidden, or outside the root', async () => {
		const page: Page = await extract(
			`<main><div role="dialog"><h2>Cookie settings</h2></div><h1>Terms</h1><h2 style="display: none">Hidden</h2><h2>Orders</h2><p>${LONG_TEXT}</p></main><div><h1>Site brand</h1></div>`
		);

		expect(page.h1).toEqual(['Terms']);
		expect(page.h2).toEqual(['Orders']);
	});
});

describe('extractPage: the page itself', () => {
	it('never modifies the document', async () => {
		const html: string = `<nav>Menu</nav><div class="cookie-banner">Cookies</div><main><h1>Terms</h1><p>${LONG_TEXT}</p></main>`;

		await renderPage(html, (document: Document): void => {
			const before: string = document.documentElement.outerHTML;

			extractPage(document);

			expect(document.documentElement.outerHTML).toBe(before);
		});
	});
});
