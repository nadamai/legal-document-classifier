import { extractFeatures } from './features/extractFeatures';
import { loadWeights } from './loadWeights';
import { predictProbability } from './model/predictProbability';
import type { FeatureVector } from './types/FeatureVector';
import type { Weights } from './types/Weights';

/**
 * Probability (0–1) that `text` is a legal document. Pass the page's main
 * content, without navigation, footer or cookie banners. Languages without
 * their own weights use the English weights.
 */
export async function predictLegalDocumentProbability(
	text: string,
	language: string = 'en'
): Promise<number> {
	const features: FeatureVector = extractFeatures(text);

	if (features.size === 0) {
		return 0;
	}

	const weights: Weights = await loadWeights(language);

	return predictProbability(features, weights);
}
