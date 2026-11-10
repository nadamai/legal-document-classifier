import { extractFeatures } from './features/extractFeatures';
import { loadWeights } from './loadWeights';
import { predictProbability } from './model/predictProbability';
import type { FeatureVector } from './types/FeatureVector';
import type { Page } from './types/Page';
import type { Weights } from './types/Weights';

export async function predictWebLegalDocumentFeaturesProbability(
	page: Page,
	language: string = 'en'
): Promise<number> {
	const features: FeatureVector = extractFeatures(page);

	if (features.size === 0) {
		return 0;
	}

	const weights: Weights = await loadWeights(language);

	return predictProbability(features, weights);
}
