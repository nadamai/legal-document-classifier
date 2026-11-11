import type { Weights } from '../types/Weights';

export function isWeights(value: unknown): value is Weights {
	if (
		typeof value !== 'object' ||
		value === null ||
		!('bias' in value) ||
		!('weights' in value)
	) {
		return false;
	}

	const bias: unknown = value.bias;
	const weights: unknown = value.weights;

	return (
		Number.isFinite(bias) &&
		typeof weights === 'object' &&
		weights !== null &&
		!Array.isArray(weights) &&
		Object.values(weights).every((weight: unknown): boolean =>
			Number.isFinite(weight)
		)
	);
}
