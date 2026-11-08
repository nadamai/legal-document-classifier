const SIGNIFICANT_LEGAL_SYMBOLS: string = '§¶№©®™&';

const TOKEN: RegExp = new RegExp(
	`[\\p{L}\\p{M}\\p{N}]+|[${SIGNIFICANT_LEGAL_SYMBOLS}]`,
	'gu'
);

/**
 * Words are normalised after splitting, because NFKC on the whole text would
 * turn `№` into "No" and `™` into "TM".
 */
export function tokenize(text: string): string[] {
	const tokens: string[] = [];

	for (const [token] of text.matchAll(TOKEN)) {
		tokens.push(
			SIGNIFICANT_LEGAL_SYMBOLS.includes(token)
				? token
				: token.normalize('NFKC').toLowerCase()
		);
	}

	return tokens;
}
