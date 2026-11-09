import { extractFeatures } from './features/extractFeatures';
import { loadWeights } from './loadWeights';
import { predictProbability } from './model/predictProbability';
import type { FeatureVector } from './types/FeatureVector';
import type { Page } from './types/Page';
import type { Weights } from './types/Weights';

/**
 * Probability (0–1) that a page is a legal document, or 0 for a page without
 * tokens. `content` is the page's main text, without navigation, footer or
 * cookie banners. Take the title and headings from that same main content.
 * Languages without their own weights use the English weights.
 */
export async function predictLegalDocumentProbability(
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
