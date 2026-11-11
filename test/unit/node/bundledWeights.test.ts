import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { predictWebLegalDocumentFeaturesProbability as score } from '~/src/model/predictWebLegalDocumentFeaturesProbability';
import { SUPPORTED_LANGUAGES } from '~/src/model/supportedLanguages';
import {
	ENGLISH_PRIVACY_POLICY,
	ENGLISH_PRODUCT_PAGE,
	POLISH_PRODUCT_PAGE,
	POLISH_TERMS
} from '~/test/common/fixtures/pages';

// Sanity bounds on obvious pages, not a benchmark: `npm run evaluate` measures
// the model. A retrain that breaks these has gone badly wrong.
const MIN_LEGAL_P: number = 0.9;
const MAX_ORDINARY_P: number = 0.5;

const WEIGHTS_DIRECTORY: URL = new URL(
	'../../../src/weights/',
	import.meta.url
);

describe('bundled weights', () => {
	it('exist exactly for SUPPORTED_LANGUAGES', () => {
		const languages: string[] = readdirSync(WEIGHTS_DIRECTORY)
			.filter((file: string): boolean => file.endsWith('.json'))
			.map((file: string): string => file.slice(0, -'.json'.length));

		expect(languages.sort()).toEqual([...SUPPORTED_LANGUAGES].sort());
	});

	it('score an obvious English privacy policy high', async () => {
		expect(await score(ENGLISH_PRIVACY_POLICY, 'en')).toBeGreaterThan(
			MIN_LEGAL_P
		);
	});

	it('score an English product page low', async () => {
		expect(await score(ENGLISH_PRODUCT_PAGE, 'en')).toBeLessThan(
			MAX_ORDINARY_P
		);
	});

	it('score obvious Polish terms high', async () => {
		expect(await score(POLISH_TERMS, 'pl')).toBeGreaterThan(MIN_LEGAL_P);
	});

	it('score a Polish product page low', async () => {
		expect(await score(POLISH_PRODUCT_PAGE, 'pl')).toBeLessThan(MAX_ORDINARY_P);
	});

	it('return 0 for a page without tokens', async () => {
		expect(await score({ content: '1 2 3', title: '404' }, 'en')).toBe(0);
	});

	it('give the same result for the same page', async () => {
		expect(await score(ENGLISH_PRIVACY_POLICY, 'en')).toBe(
			await score(ENGLISH_PRIVACY_POLICY, 'en')
		);
	});
});
