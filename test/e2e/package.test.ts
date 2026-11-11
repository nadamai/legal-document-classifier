import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { extractPage } from '../../src/extraction/extractPage';
import type * as Package from '../../src/index';
import { sigmoid } from '../../src/model/sigmoid';
import type { Page } from '../../src/types/Page';
import { renderPage } from '../common/renderPage';

// Run `npm run build` first; `npm test` does.
const PACKAGE_URL: string = '/dist/index.js';
const EXTRACTOR_URL: string = '/dist/extractor.iife.js';

// Served by the test server from the repository root.
const CONSTANT_WEIGHTS_URL: string =
	'/test/common/fixtures/weights/constant.json';

const ENGLISH_POLICY_HTML: string = `
	<title>Privacy Policy | Example Store</title>
	<nav><a href="/">Home</a> <a href="/shop">Shop</a></nav>
	<main>
		<h1>Privacy Policy</h1>
		<h2>What personal data we collect</h2>
		<p>Example Store Ltd is the controller of your personal data. We collect your name, email address and delivery address when you place an order.</p>
		<h2>Your rights</h2>
		<p>You have the right to access, correct or delete your personal data, and to withdraw your consent at any time. We will not sell your personal data to any third party.</p>
	</main>
	<div class="cookie-banner">We use cookies. <button>Accept</button></div>
	<footer>© Example Store</footer>`;

const POLISH_TERMS_HTML: string = `
	<title>Regulamin sklepu internetowego</title>
	<main>
		<h1>Regulamin sklepu internetowego</h1>
		<h2>Postanowienia ogólne</h2>
		<p>Niniejszy regulamin określa zasady korzystania ze sklepu internetowego oraz prawa i obowiązki sprzedawcy i klienta.</p>
		<h2>Prawo odstąpienia od umowy</h2>
		<p>Konsument ma prawo odstąpić od umowy w terminie czternastu dni bez podania przyczyny.</p>
	</main>`;

const PRODUCT_HTML: string = `
	<title>Trail Running Shoes – Example Store</title>
	<main>
		<h1>Trail Running Shoes</h1>
		<p>Lightweight shoes with a grippy sole for muddy paths. Add to cart.</p>
		<h2>Reviews</h2>
		<p>Great shoes, comfortable from the first run.</p>
	</main>`;

let pkg: typeof Package;

beforeAll(async () => {
	pkg = await import(/* @vite-ignore */ PACKAGE_URL);
});

afterEach(() => {
	pkg.configure({});
});

describe('built package', () => {
	it('exports only the public API', () => {
		expect(Object.keys(pkg).sort()).toEqual([
			'SUPPORTED_LANGUAGES',
			'configure',
			'predictWebLegalDocumentProbability'
		]);
	});

	it('scores an English policy page with the default language', async () => {
		const p: number = await renderPage(
			ENGLISH_POLICY_HTML,
			(document: Document): Promise<number> =>
				pkg.predictWebLegalDocumentProbability(document)
		);

		expect(p).toBeGreaterThan(0.9);
	});

	it('loads the Polish weights chunk', async () => {
		const p: number = await renderPage(
			POLISH_TERMS_HTML,
			(document: Document): Promise<number> =>
				pkg.predictWebLegalDocumentProbability(document, 'pl')
		);

		expect(p).toBeGreaterThan(0.9);
	});

	it('scores a product page lower than a policy', async () => {
		const product: number = await renderPage(
			PRODUCT_HTML,
			(document: Document): Promise<number> =>
				pkg.predictWebLegalDocumentProbability(document, 'en')
		);

		expect(product).toBeLessThan(0.5);
	});

	it('throws for a language without weights', async () => {
		await renderPage(
			PRODUCT_HTML,
			async (document: Document): Promise<void> => {
				await expect(
					pkg.predictWebLegalDocumentProbability<string>(document, 'jp')
				).rejects.toThrow('Unsupported language: "jp"');
			}
		);
	});

	it('fetches custom weights from a relative URL', async () => {
		pkg.configure({ weights: { de: CONSTANT_WEIGHTS_URL } });

		const p: number = await renderPage(
			PRODUCT_HTML,
			(document: Document): Promise<number> =>
				pkg.predictWebLegalDocumentProbability<'de'>(document, 'de')
		);

		expect(p).toBe(sigmoid(4));
	});
});

describe('dist/extractor.iife.js', () => {
	let extractor: { extractPage: typeof extractPage };

	beforeAll(async () => {
		const source: string = await (await fetch(EXTRACTOR_URL)).text();

		// The scraper evaluates the same file as a classic script.
		extractor = new Function(`${source}\nreturn LegalDocumentExtractor;`)();
	});

	it.each([
		['an English policy', ENGLISH_POLICY_HTML],
		['Polish terms', POLISH_TERMS_HTML],
		['a product page', PRODUCT_HTML]
	])(
		'extracts %s exactly as the source does',
		async (_name: string, html: string) => {
			const [built, source]: Page[] = await renderPage(
				html,
				(document: Document): Page[] => [
					extractor.extractPage(document),
					extractPage(document)
				]
			);

			expect(built).toEqual(source);
			expect(built?.content).not.toBe('');
		}
	);
});
