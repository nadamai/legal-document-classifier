const SIGNIFICANT_LEGAL_SYMBOLS: string = '§¶№©®™&';

const TOKEN: RegExp = new RegExp(
	`[\\p{L}\\p{M}\\p{N}]+|[${SIGNIFICANT_LEGAL_SYMBOLS}]`,
	'gu'
);

const NUMBER: RegExp = /^\p{N}+$/u;

/**
 * Words are normalised after splitting, because NFKC on the whole text would
 * turn `№` into "No" and `™` into "TM". Numbers are dropped, so they stay
 * neutral: list counters, years and postal codes are noise.
 */
export function tokenize(text: string): string[] {
	const tokens: string[] = [];

	for (const [token] of text.matchAll(TOKEN)) {
		if (SIGNIFICANT_LEGAL_SYMBOLS.includes(token)) {
			tokens.push(token);

			continue;
		}

		const word: string = token.normalize('NFKC').toLowerCase();

		if (!NUMBER.test(word)) {
			tokens.push(word);
		}
	}

	return tokens;
}
