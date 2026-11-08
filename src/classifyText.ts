import { extractFeatures } from './features/extractFeatures.ts';
import { score } from './model/score.ts';
import type { FeatureVector } from './types/FeatureVector.ts';
import type { Weights } from './types/Weights.ts';
import { loadWeights } from './weights/loadWeights.ts';

/**
 * Probability, from 0 to 1, that `text` is a legal document, or `null` when
 * the text has no words.
 *
 * `text` should be the page's main content, without navigation, footer or
 * cookie banners. `language` is the code that Chromium's
 * `chrome.i18n.detectLanguage` returned for that text. The weights for the
 * language are loaded on first use.
 */
export async function classifyText(
	text: string,
	language: string
): Promise<number | null> {
	const features: FeatureVector | null = extractFeatures(text);
	if (features === null) {
		return null;
	}
	const weights: Weights = await loadWeights(language);
	return score(features, weights);
}
