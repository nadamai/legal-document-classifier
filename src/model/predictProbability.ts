import type { FeatureVector } from '../types/FeatureVector';
import type { Weights } from '../types/Weights';
import { sigmoid } from './sigmoid';

export function predictProbability(
	features: FeatureVector,
	weights: Weights
): number {
	const { bias, weights: tokenWeights }: Weights = weights;

	let z: number = bias;

	for (const [token, value] of features) {
		if (Object.hasOwn(tokenWeights, token)) {
			z += (tokenWeights[token] ?? 0) * value;
		}
	}

	return sigmoid(z);
}
