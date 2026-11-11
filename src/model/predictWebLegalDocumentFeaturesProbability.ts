import { extractFeatures } from '../features/extractFeatures';
import type { FeatureVector } from '../types/FeatureVector';
import type { Page } from '../types/Page';
import type { Weights } from '../types/Weights';
import { loadWeights } from './loadWeights';
import { predictProbability } from './predictProbability';

export async function predictWebLegalDocumentFeaturesProbability(
	page: Page,
	language: string
): Promise<number> {
	// Before the empty-page check, so an unsupported language always throws.
	const weights: Weights = await loadWeights(language);
	const features: FeatureVector = extractFeatures(page);

	if (features.size === 0) {
		return 0;
	}

	return predictProbability(features, weights);
}
