import type { Weights } from '../types/Weights';
import { loadCustomWeights } from './customWeights';

// Custom weights never fall back to the bundled ones: a failed load throws.
export async function loadWeights(language: string): Promise<Weights> {
	const custom: Promise<Weights> | null = loadCustomWeights(language);

	if (custom !== null) {
		return custom;
	}

	try {
		const weightsModule: { default: Weights } = await import(
			`../weights/${language}.json`,
			{ with: { type: 'json' } }
		);

		return weightsModule.default;
	} catch (error: unknown) {
		throw new Error(`Unsupported language: "${language}"`, {
			cause: error
		});
	}
}
