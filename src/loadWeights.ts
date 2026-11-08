import type { Weights } from './types/Weights';

export async function loadWeights(language: string): Promise<Weights> {
	try {
		const weightsModule: { default: Weights } = await import(
			`./weights/${language}.json`,
			{ with: { type: 'json' } }
		);

		return weightsModule.default;
	} catch {
		const englishModule: { default: Weights } = await import(
			'./weights/en.json',
			{ with: { type: 'json' } }
		);

		return englishModule.default;
	}
}
