const SIGNIFICANT_LEGAL_SYMBOLS: string = '§¶№©®™&';

const SEGMENT_BREAKS: string = '.!?…\n\r';

const TOKEN_OR_BREAK: RegExp = new RegExp(
	`[\\p{L}\\p{M}\\p{N}]+|[${SIGNIFICANT_LEGAL_SYMBOLS}]|[${SEGMENT_BREAKS}]`,
	'gu'
);

const NUMBER: RegExp = /^\p{N}+$/u;

const MAX_ASCII_CODE: number = 127;

function isAscii(word: string): boolean {
	for (let index: number = 0; index < word.length; index++) {
		if (word.charCodeAt(index) > MAX_ASCII_CODE) {
			return false;
		}
	}

	return true;
}

// NFKC runs per word, after splitting: on the whole text it would turn `№` into
// "No" and `™` into "TM". Numbers are dropped as noise and end the segment, so
// no word pair bridges them.
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

		// NFKC leaves ASCII unchanged.
		const word: string = (
			isAscii(match) ? match : match.normalize('NFKC')
		).toLowerCase();

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
