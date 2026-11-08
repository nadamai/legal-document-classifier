import type { FeatureVector } from '../types/FeatureVector.ts';
import { tokenize } from './tokenize.ts';

/**
 * The text's words as a sparse feature vector, or `null` when the text has no
 * words. Each value is 1 + ln(count), L2-normalised over the text, so the
 * length of the text doesn't scale the result.
 */
export function extractFeatures(text: string): FeatureVector | null {
	const tokens: string[] = tokenize(text);
	if (tokens.length === 0) {
		return null;
	}

	const features: FeatureVector = new Map();
	for (const token of tokens) {
		features.set(token, (features.get(token) ?? 0) + 1);
	}

	let sumOfSquares: number = 0;
	for (const [token, count] of features) {
		const value: number = 1 + Math.log(count);
		features.set(token, value);
		sumOfSquares += value * value;
	}
	const norm: number = Math.sqrt(sumOfSquares);
	for (const [token, value] of features) {
		features.set(token, value / norm);
	}
	return features;
}
