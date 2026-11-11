import { extractPage } from './extraction/extractPage';
import { predictWebLegalDocumentFeaturesProbability } from './model/predictWebLegalDocumentFeaturesProbability';
import type { SupportedLanguage } from './types/SupportedLanguage';

const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

/**
 * Probability (0–1) that a rendered web page is a web legal document, such as a
 * website's terms of service or privacy policy. Reads the page's main content,
 * title and headings, leaving out navigation, footers and cookie banners, and
 * never modifies the page. Uses the weights set with `configure` for
 * `language`, else the bundled ones, and throws for a language with neither or
 * when custom weights fail to load.
 *
 * `language` accepts the bundled languages. To pass others, name the allowed
 * set as the type argument.
 *
 * @example
 * 	predictWebLegalDocumentProbability<SupportedLanguage | 'de'>(
 * 		document,
 * 		'de'
 * 	);
 */
export async function predictWebLegalDocumentProbability<
	Language extends string = SupportedLanguage
>(document: Document, language?: NoInfer<Language>): Promise<number> {
	return predictWebLegalDocumentFeaturesProbability(
		extractPage(document),
		language ?? DEFAULT_LANGUAGE
	);
}
