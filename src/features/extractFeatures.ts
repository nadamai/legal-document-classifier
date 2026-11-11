import type { FeatureVector } from '../types/FeatureVector';
import type { Page } from '../types/Page';
import { tokenizeSegments } from './tokenize';

const MAX_CONTENT_LENGTH: number = 30000;

// Tokens never contain spaces, so a pair can't collide with a token.
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

// Normalised per field, so a long body can't shrink a short title's features.
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

function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text;
	}

	const lastBreak: number = Math.max(
		text.lastIndexOf(' ', maxLength),
		text.lastIndexOf('\n', maxLength)
	);

	return text.slice(0, lastBreak > 0 ? lastBreak : maxLength);
}

// `h2` is also part of `content`, so its words count twice there.
// Tokens never contain `:`, so prefixed names can't collide.
export function extractFeatures(page: Page): FeatureVector {
	const features: FeatureVector = new Map();

	addField(
		features,
		withPairs([
			...tokenizeSegments(truncate(page.content, MAX_CONTENT_LENGTH)),
			...tokenizeSegments((page.h2 ?? []).join('\n'))
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
