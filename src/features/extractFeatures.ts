import type { FeatureVector } from '../types/FeatureVector';
import type { Page } from '../types/Page';
import { tokenize } from './tokenize';

/**
 * Adds one field's tokens under `prefix`, L2-normalised within the field, so
 * neither the text's length nor the other fields affect their scale.
 */
function addField(
	features: FeatureVector,
	tokens: readonly string[],
	prefix: string
): void {
	const counts: Map<string, number> = new Map();

	for (const token of tokens) {
		counts.set(token, (counts.get(token) ?? 0) + 1);
	}

	let sumOfSquares: number = 0;

	for (const [token, count] of counts) {
		const value: number = 1 + Math.log(count);

		counts.set(token, value);

		sumOfSquares += value * value;
	}

	const norm: number = Math.sqrt(sumOfSquares);

	for (const [token, value] of counts) {
		features.set(`${prefix}${token}`, value / norm);
	}
}

/**
 * Content tokens are unprefixed. Title and heading tokens get their own
 * prefixes (`title:`, `h1:`, …), so a word in a heading has its own weight.
 * Tokens never contain `:`, so the names can't collide.
 */
export function extractFeatures(page: Page): FeatureVector {
	const features: FeatureVector = new Map();

	addField(features, tokenize(page.content), '');
	addField(features, tokenize(page.title ?? ''), 'title:');
	addField(features, tokenize((page.h1 ?? []).join('\n')), 'h1:');
	addField(features, tokenize((page.h2 ?? []).join('\n')), 'h2:');
	addField(features, tokenize((page.h3 ?? []).join('\n')), 'h3:');

	return features;
}
