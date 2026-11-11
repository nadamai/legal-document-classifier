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

describe('extractPage: collapsed content', () => {
	it('reads a closed <details> in place, one line per block', async () => {
		const page: Page = await extract(
			'<p>Intro</p><details><summary>Returns</summary><p>You can return\n      any order.</p><ul><li>Within 14 days</li><li>Unused</li></ul></details><p>Outro</p>'
		);

		expect(page.content).toBe(
			'Intro\nReturns\nYou can return any order.\nWithin 14 days\nUnused\nOutro'
		);
	});

	it('reads text right inside a closed <details>', async () => {
		const page: Page = await extract(
			'<details><summary>Question</summary>Answer text</details>'
		);

		expect(page.content).toBe('Question\nAnswer text');
	});

	it('reads hidden="until-found"', async () => {
		const page: Page = await extract(
			'<h2>Liability</h2><div hidden="until-found"><p>Our liability is limited.</p></div>'
		);

		expect(page.content).toBe('Liability\nOur liability is limited.');
	});

	it.each([
		['the hidden attribute', 'hidden'],
		['display: none', 'style="display: none"']
	])(
		'reads an accordion panel hidden with %s',
		async (_name: string, hiding: string) => {
			const page: Page = await extract(
				`<h3><button aria-expanded="false" aria-controls="p1">Payments</button></h3><div id="p1" ${hiding}><p>We accept cards.</p></div>`
			);

			expect(page.content).toBe('Payments\nWe accept cards.');
		}
	);

	it('separates table cells and rows', async () => {
		const page: Page = await extract(
			'<details><summary>Cookies</summary><table><tr><td>session_id</td><td>1 day</td></tr><tr><td>lang</td><td>1 year</td></tr></table></details>'
		);

		expect(page.content).toBe('Cookies\nsession_id 1 day\nlang 1 year');
	});

	it('reads the headings inside collapsed content', async () => {
		const page: Page = await extract(
			'<details><summary>More</summary><h2>Data retention</h2><p>Text</p></details>'
		);

		expect(page.h2).toEqual(['Data retention']);
	});

	it('reads nested collapsed content once', async () => {
		const page: Page = await extract(
			'<details><summary>Outer</summary><details><summary>Inner</summary><p>Deep text</p></details></details>'
		);

		expect(page.content).toBe('Outer\nInner\nDeep text');
	});

	it('reads an expanded panel once, as visible text', async () => {
		const page: Page = await extract(
			'<button aria-expanded="true" aria-controls="p1">Open</button><div id="p1"><p>Shown text</p></div>'
		);

		expect(page.content).toBe('Open\nShown text');
	});

	it('still drops what is excluded or not rendered inside it', async () => {
		const page: Page = await extract(
			'<details><summary>Terms</summary><nav>Menu</nav><div class="cookie-banner">We use cookies</div><script>var x = 1;</script><p>Kept text</p></details>'
		);

		expect(page.content).toBe('Terms\nKept text');
	});

	it.each([
		[
			'a menu behind aria-haspopup',
			'<button aria-expanded="false" aria-haspopup="menu" aria-controls="m">Account</button><div id="m" hidden>Sign out</div>'
		],
		[
			'a panel with role="menu"',
			'<button aria-expanded="false" aria-controls="m">Account</button><div id="m" role="menu" hidden>Sign out</div>'
		],
		[
			'a dialog behind a button',
			'<button aria-expanded="false" aria-controls="d">Help</button><div id="d" role="dialog" hidden>Chat with us</div>'
		],
		[
			'a panel controlled from the page header',
			'<header><button aria-expanded="false" aria-controls="m">Menu</button></header><div id="m" hidden>Sign out</div>'
		],
		[
			'a collapsed panel inside a nav',
			'<nav><details><summary>Shop</summary>Sign out</details></nav>'
		],
		[
			'a collapsed panel inside a consent banner',
			'<div class="cookie-banner"><details><summary>Details</summary>Sign out</details></div>'
		],
		['plain display: none', '<div style="display: none">Sign out</div>']
	])('leaves out %s', async (_name: string, element: string) => {
		const page: Page = await extract(`<p>${LONG_TEXT}</p>${element}`);

		expect(page.content).not.toContain('Sign out');
		expect(page.content).not.toContain('Chat with us');
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

	it('reads the children of a display: contents element', async () => {
		const page: Page = await extract(
			// Next to an excluded element, so each child is checked one by one.
			'<nav>x</nav><div style="display: contents"><p>Inside contents</p><details><summary>Section</summary><p>Collapsed text</p></details></div>'
		);

		expect(page.content).toBe('Inside contents\nSection\nCollapsed text');
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
