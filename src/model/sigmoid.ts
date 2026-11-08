export function sigmoid(z: number): number {
	if (z >= 0) {
		return 1 / (1 + Math.exp(-z));
	}

	const e: number = Math.exp(z);

	return e / (1 + e);
}
