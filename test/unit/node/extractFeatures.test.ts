import { describe, expect, it } from 'vitest';
import { extractFeatures } from '~/src/features/extractFeatures';
import type { FeatureVector } from '~/src/types/FeatureVector';
import { FEATURE_SNAPSHOT_PAGES } from '~/test/common/fixtures/pages';

const MAX_CONTENT_LENGTH: number = 30000;

function groupNorm(features: FeatureVector, prefix: string): number {
	let sumOfSquares: number = 0;

	for (const [name, value] of features) {
		const inGroup: boolean =
			prefix === '' ? !name.includes(':') : name.startsWith(prefix);

		if (inGroup) {
			sumOfSquares += value * value;
		}
	}

	return Math.sqrt(sumOfSquares);
}

function sortedObject(features: FeatureVector): Record<string, number> {
	return Object.fromEntries(
		[...features].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
	);
}

describe('extractFeatures', () => {
	it('adds word pairs within a segment, never across one', () => {
		const features: FeatureVector = extractFeatures({
			content: 'terms of service. privacy\npolicy'
		});

		expect([...features.keys()].sort()).toEqual([
			'of',
			'of service',
			'policy',
			'privacy',
			'service',
			'terms',
			'terms of'
		]);
	});

	it('weights repeats as 1 + ln(count), normalised per group', () => {
		const features: FeatureVector = extractFeatures({ content: 'a b a' });
		const norm: number = Math.sqrt((1 + Math.log(2)) ** 2 + 3);

		expect(features.get('a')).toBeCloseTo((1 + Math.log(2)) / norm, 15);
		expect(features.get('b')).toBeCloseTo(1 / norm, 15);
		expect(features.get('a b')).toBeCloseTo(1 / norm, 15);
		expect(features.get('b a')).toBeCloseTo(1 / norm, 15);
	});

	it('gives title and h1 their own prefixed, separately normalised groups', () => {
		const features: FeatureVector = extractFeatures({
			content: 'privacy '.repeat(50),
			title: 'Privacy Policy',
			h1: ['Privacy']
		});

		expect(features.has('title:privacy policy')).toBe(true);
		expect(features.has('h1:privacy')).toBe(true);
		expect(groupNorm(features, '')).toBeCloseTo(1, 12);
		expect(groupNorm(features, 'title:')).toBeCloseTo(1, 12);
		expect(groupNorm(features, 'h1:')).toBeCloseTo(1, 12);
		expect(features.get('h1:privacy')).toBe(1);
	});

	it('never pairs words across separate headings', () => {
		const features: FeatureVector = extractFeatures({
			content: '',
			h1: ['Terms', 'Privacy']
		});

		expect(features.has('h1:terms privacy')).toBe(false);
	});

	it('adds h2 to the content group, so its words count twice there', () => {
		const withoutH2: FeatureVector = extractFeatures({
			content: 'your rights\nwe process data'
		});
		const withH2: FeatureVector = extractFeatures({
			content: 'your rights\nwe process data',
			h2: ['Your rights']
		});

		expect(withH2.has('h2:your rights')).toBe(false);
		expect(withH2.get('rights') ?? 0).toBeGreaterThan(
			withoutH2.get('rights') ?? 0
		);
	});

	it('counts only the first 30,000 characters of content, cut at a space', () => {
		const filler: string = 'word '.repeat(MAX_CONTENT_LENGTH / 5 - 1);
		const features: FeatureVector = extractFeatures({
			content: `${filler}cutoff beyond`,
			title: 'beyond'
		});

		expect(features.has('word')).toBe(true);
		expect(features.has('beyond')).toBe(false);
		expect(features.has('cutoff')).toBe(false);
		expect(features.has('title:beyond')).toBe(true);
	});

	it('returns no features for a page without tokens', () => {
		expect(extractFeatures({ content: '' }).size).toBe(0);
		expect(extractFeatures({ content: '12 34', title: '2026' }).size).toBe(0);
	});

	// A diff here means the features changed: retrain the weights in the same
	// change, then update the snapshot with `npm test -- -u`.
	it('matches the feature snapshot', async () => {
		const snapshot: Record<string, Record<string, number>> = Object.fromEntries(
			Object.entries(FEATURE_SNAPSHOT_PAGES).map(([name, page]) => [
				name,
				sortedObject(extractFeatures(page))
			])
		);

		await expect(
			`${JSON.stringify(snapshot, null, '\t')}\n`
		).toMatchFileSnapshot('../../common/snapshots/features.json');
	});
});
