import { extractPage } from './extraction/extractPage';
import { predictWebLegalDocumentFeaturesProbability } from './model/predictWebLegalDocumentFeaturesProbability';
import type { SupportedLanguage } from './types/SupportedLanguage';

/**
 * Probability (0–1) that a rendered web page is a web legal document, such as a
 * website's terms of service or privacy policy. Reads the page's main content,
 * title and headings, leaving out navigation, footers and cookie banners, and
 * never modifies the page.
 */
export async function predictWebLegalDocumentProbability(
	document: Document,
	language: SupportedLanguage = 'en'
): Promise<number> {
	return predictWebLegalDocumentFeaturesProbability(
		extractPage(document),
		language
	);
}
