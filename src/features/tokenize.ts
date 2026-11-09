const SIGNIFICANT_LEGAL_SYMBOLS: string = '§¶№©®™&';

const SEGMENT_BREAKS: string = '.!?…\n\r';

const TOKEN_OR_BREAK: RegExp = new RegExp(
	`[\\p{L}\\p{M}\\p{N}]+|[${SIGNIFICANT_LEGAL_SYMBOLS}]|[${SEGMENT_BREAKS}]`,
	'gu'
);

const NUMBER: RegExp = /^\p{N}+$/u;

/**
 * Splits text into runs of tokens, so word pairs never cross a run's edge. A
 * run ends at a line break, a sentence end (`.`, `!`, `?`, `…`) or a dropped
 * number. Words are normalised after splitting, because NFKC on the whole text
 * would turn `№` into "No" and `™` into "TM". Numbers are dropped, so they stay
 * neutral: list counters, years and postal codes are noise.
 */
export function tokenizeSegments(text: string): string[][] {
	const segments: string[][] = [];
	let segment: string[] = [];

	const endSegment = (): void => {
		if (segment.length > 0) {
			segments.push(segment);
			segment = [];
		}
	};

	for (const [match] of text.matchAll(TOKEN_OR_BREAK)) {
		if (SEGMENT_BREAKS.includes(match)) {
			endSegment();

			continue;
		}

		if (SIGNIFICANT_LEGAL_SYMBOLS.includes(match)) {
			segment.push(match);

			continue;
		}

		const word: string = match.normalize('NFKC').toLowerCase();

		if (NUMBER.test(word)) {
			endSegment();
		} else {
			segment.push(word);
		}
	}

	endSegment();

	return segments;
}

export function tokenize(text: string): string[] {
	return tokenizeSegments(text).flat();
}
