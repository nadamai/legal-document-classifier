import type { FeatureVector } from '../types/FeatureVector.ts';
import type { Weights } from '../types/Weights.ts';

/**
 * Logistic regression: sigmoid(Σ weight × value). Words without a weight
 * count as 0. Only the weights object's own keys are read, so words like
 * `constructor` never pick up a value from `Object.prototype`. The sigmoid is
 * computed in a numerically stable form for both signs of the sum.
 */
export function score(features: FeatureVector, weights: Weights): number {
	let z: number = 0;
	for (const [word, value] of features) {
		if (Object.hasOwn(weights, word)) {
			z += (weights[word] ?? 0) * value;
		}
	}
	if (z >= 0) {
		return 1 / (1 + Math.exp(-z));
	}
	const e: number = Math.exp(z);
	return e / (1 + e);
}
