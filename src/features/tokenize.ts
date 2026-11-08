const TOKEN: RegExp = /[\p{L}\p{N}]+/gu;

/**
 * Splits text into lowercase word tokens. It uses only operations that give
 * the same result in Node (training) and Chrome (production): NFKC
 * normalisation, locale-independent lowercasing, and the Unicode letter and
 * number classes.
 */
export function tokenize(text: string): string[] {
	return text.normalize('NFKC').toLowerCase().match(TOKEN) ?? [];
}
