import type { FeatureVector } from '../types/FeatureVector.ts';
import { tokenize } from './tokenize.ts';

/** L2-normalised, so the text's length doesn't affect the score. */
export function extractFeatures(text: string): FeatureVector {
	const tokens: string[] = tokenize(text);
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
