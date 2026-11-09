import type { FeatureVector } from '../types/FeatureVector';
import type { Page } from '../types/Page';
import { tokenizeSegments } from './tokenize';

/**
 * Every token, plus every pair of neighbouring tokens within a segment, joined
 * by a space (`polityka prywatności`). Tokens never contain spaces, so a pair
 * can't collide with a single token.
 */
function withPairs(segments: readonly (readonly string[])[]): string[] {
	const terms: string[] = [];

	for (const segment of segments) {
		let previous: string | null = null;

		for (const token of segment) {
			terms.push(token);

			if (previous !== null) {
				terms.push(`${previous} ${token}`);
			}

			previous = token;
		}
	}

	return terms;
}

/**
 * Adds one field's terms under `prefix`, L2-normalised within the field, so
 * neither the text's length nor the other fields affect their scale.
 */
function addField(
	features: FeatureVector,
	terms: readonly string[],
	prefix: string
): void {
	const counts: Map<string, number> = new Map();

	for (const term of terms) {
		counts.set(term, (counts.get(term) ?? 0) + 1);
	}

	let sumOfSquares: number = 0;

	for (const [term, count] of counts) {
		const value: number = 1 + Math.log(count);

		counts.set(term, value);

		sumOfSquares += value * value;
	}

	const norm: number = Math.sqrt(sumOfSquares);

	for (const [term, value] of counts) {
		features.set(`${prefix}${term}`, value / norm);
	}
}

/**
 * Content terms are unprefixed. `h2` and `h3` terms join them, so they're
 * scored by the same weights and count once more on top of their place in the
 * content. Title and `h1` terms get their own prefixes (`title:`, `h1:`) and so
 * their own weights. Terms never contain `:`, so the names can't collide.
 */
export function extractFeatures(page: Page): FeatureVector {
	const features: FeatureVector = new Map();

	addField(
		features,
		withPairs([
			...tokenizeSegments(page.content),
			...tokenizeSegments((page.h2 ?? []).join('\n')),
			...tokenizeSegments((page.h3 ?? []).join('\n'))
		]),
		''
	);
	addField(features, withPairs(tokenizeSegments(page.title ?? '')), 'title:');
	addField(
		features,
		withPairs(tokenizeSegments((page.h1 ?? []).join('\n'))),
		'h1:'
	);

	return features;
}
