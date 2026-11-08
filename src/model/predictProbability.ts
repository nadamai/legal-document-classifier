import type { FeatureVector } from '../types/FeatureVector';
import type { Weights } from '../types/Weights';
import { sigmoid } from './sigmoid';

/** Logistic regression: sigmoid(Σ weight × value) */
export function predictProbability(
	features: FeatureVector,
	weights: Weights
): number {
	let z: number = 0;

	for (const [word, value] of features) {
		if (Object.hasOwn(weights, word)) {
			z += (weights[word] ?? 0) * value;
		}
	}

	return sigmoid(z);
}
