import { createServer, type Server } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { configure } from '../../../src/configure';
import { predictWebLegalDocumentFeaturesProbability as score } from '../../../src/model/predictWebLegalDocumentFeaturesProbability';
import { sigmoid } from '../../../src/model/sigmoid';
import type { Page } from '../../../src/types/Page';
import type { Weights } from '../../../src/types/Weights';

const PAGE: Page = { content: 'We process your personal data.' };

const DE_WEIGHTS: Weights = { bias: 2, weights: { personal: 1 } };

let requests: string[] = [];
let flakyRecovered: boolean = false;
let baseUrl: string = '';

const server: Server = createServer((request, response) => {
	requests.push(request.url ?? '');

	if (request.url === '/de.json') {
		response.setHeader('content-type', 'application/json');
		response.end(JSON.stringify(DE_WEIGHTS));
	} else if (request.url === '/flaky.json' && !flakyRecovered) {
		flakyRecovered = true;
		response.statusCode = 503;
		response.end();
	} else if (request.url === '/flaky.json') {
		response.end(JSON.stringify({ bias: -3, weights: {} }));
	} else if (request.url === '/invalid.json') {
		response.end(JSON.stringify({ bias: 'high', weights: [] }));
	} else if (request.url === '/broken.json') {
		response.end('{ not json');
	} else {
		response.statusCode = 404;
		response.end();
	}
});

beforeAll(async () => {
	await new Promise<void>((resolve: () => void): void => {
		server.listen(0, '127.0.0.1', resolve);
	});

	const address: ReturnType<Server['address']> = server.address();

	if (address === null || typeof address === 'string') {
		throw new Error('The test server has no port');
	}

	baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
	server.close();
});

afterEach(() => {
	configure({});
	requests = [];
	flakyRecovered = false;
});

describe('configure', () => {
	it('overrides a bundled language with an object', async () => {
		const bundled: number = await score(PAGE, 'en');

		configure({ weights: { en: { bias: 5, weights: {} } } });

		expect(await score(PAGE, 'en')).toBe(sigmoid(5));
		expect(await score(PAGE, 'pl')).not.toBe(sigmoid(5));

		configure({});

		expect(await score(PAGE, 'en')).toBe(bundled);
	});

	it('adds a language from a URL, fetched once for concurrent calls', async () => {
		configure({ weights: { de: `${baseUrl}/de.json` } });

		const [first, second] = await Promise.all([
			score(PAGE, 'de'),
			score(PAGE, 'de')
		]);
		const third: number = await score(PAGE, 'de');

		expect(first).toBeGreaterThan(sigmoid(2));
		expect(second).toBe(first);
		expect(third).toBe(first);
		expect(requests).toEqual(['/de.json']);
	});

	it('accepts a URL object', async () => {
		configure({ weights: { de: new URL('/de.json', baseUrl) } });

		expect(await score(PAGE, 'de')).toBeGreaterThan(sigmoid(2));
	});

	it('throws on an HTTP error, never falls back, and retries on the next call', async () => {
		configure({ weights: { en: `${baseUrl}/flaky.json` } });

		await expect(score(PAGE, 'en')).rejects.toThrow(
			`Failed to load weights for "en" from ${baseUrl}/flaky.json`
		);
		expect(await score(PAGE, 'en')).toBe(sigmoid(-3));
		expect(requests).toEqual(['/flaky.json', '/flaky.json']);
	});

	it.each([
		['a missing file', '/missing.json', 'Failed to load weights'],
		['a body that is not JSON', '/broken.json', 'Failed to load weights'],
		['JSON that is not weights', '/invalid.json', 'Invalid weights']
	])('throws for %s', async (_name: string, path: string, message: string) => {
		configure({ weights: { de: `${baseUrl}${path}` } });

		await expect(score(PAGE, 'de')).rejects.toThrow(
			`${message} for "de" from ${baseUrl}${path}`
		);
	});

	it('throws for a failed load even on an empty page', async () => {
		configure({ weights: { de: `${baseUrl}/missing.json` } });

		await expect(score({ content: '' }, 'de')).rejects.toThrow(
			'Failed to load weights'
		);
	});

	it('rejects an invalid object and keeps the previous configuration', async () => {
		configure({ weights: { en: { bias: 5, weights: {} } } });

		expect(() =>
			configure({ weights: { en: { bias: 1, weights: { a: Number.NaN } } } })
		).toThrow('Invalid weights for "en"');
		expect(await score(PAGE, 'en')).toBe(sigmoid(5));
	});

	it('copies objects, so later changes have no effect', async () => {
		const weights: { bias: number; weights: Record<string, number> } = {
			bias: 1,
			weights: {}
		};

		configure({ weights: { en: weights } });
		weights.bias = 100;

		expect(await score(PAGE, 'en')).toBe(sigmoid(1));
	});

	it('replaces the whole set on every call', async () => {
		configure({ weights: { de: DE_WEIGHTS } });
		configure({ weights: { cs: DE_WEIGHTS } });

		await expect(score(PAGE, 'de')).rejects.toThrow(
			'Unsupported language: "de"'
		);
		expect(await score(PAGE, 'cs')).toBeGreaterThan(sigmoid(2));
	});

	it('forgets cached URL weights after configure', async () => {
		configure({ weights: { de: `${baseUrl}/de.json` } });
		await score(PAGE, 'de');
		configure({ weights: { de: `${baseUrl}/de.json` } });
		await score(PAGE, 'de');

		expect(requests).toEqual(['/de.json', '/de.json']);
	});
});
