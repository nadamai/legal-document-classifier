import type { SupportedLanguage } from '../types/SupportedLanguage';
import type { Weights } from '../types/Weights';

export async function loadWeights(
	language: SupportedLanguage
): Promise<Weights> {
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
