import { describe, expect, it } from 'vitest';
import { tokenize, tokenizeSegments } from '../../../src/features/tokenize';

describe('tokenize', () => {
	it('lowercases words and drops punctuation', () => {
		expect(tokenize('Privacy POLICY, ok—fine/really')).toEqual([
			'privacy',
			'policy',
			'ok',
			'fine',
			'really'
		]);
	});

	it('NFKC-normalises non-ASCII words', () => {
		expect(tokenize('ＴＥＲＭＳ ﬁle Ǆ')).toEqual(['terms', 'file', 'dž']);
	});

	it('keeps legal symbols as tokens, even attached to a number', () => {
		expect(tokenize('§2 ¶ №5 © ® ™ Terms & Conditions')).toEqual([
			'§',
			'¶',
			'№',
			'©',
			'®',
			'™',
			'terms',
			'&',
			'conditions'
		]);
	});

	it('drops numbers, including full-width and superscript digits', () => {
		expect(tokenize('1 2026 94043 ２０２６ ¹²')).toEqual([]);
	});

	it('keeps words that merely contain digits', () => {
		expect(tokenize('mp3 312g')).toEqual(['mp3', '312g']);
	});

	it('keeps single-character words and splits at apostrophes', () => {
		expect(tokenize('a, i, don’t')).toEqual(['a', 'i', 'don', 't']);
	});
});

describe('tokenizeSegments', () => {
	it('ends a segment at a sentence end', () => {
		expect(
			tokenizeSegments('personal data. Data controller! Yes? Wait… no')
		).toEqual([
			['personal', 'data'],
			['data', 'controller'],
			['yes'],
			['wait'],
			['no']
		]);
	});

	it('ends a segment at a line break', () => {
		expect(tokenizeSegments('line one\nline two\r\nline three')).toEqual([
			['line', 'one'],
			['line', 'two'],
			['line', 'three']
		]);
	});

	it('ends a segment at a dropped number', () => {
		expect(tokenizeSegments('art. 5 sec. 2')).toEqual([['art'], ['sec']]);
		expect(tokenizeSegments('chapter 1 begins')).toEqual([
			['chapter'],
			['begins']
		]);
		expect(tokenizeSegments('§2 sec. 3')).toEqual([['§'], ['sec']]);
	});

	it('returns no segments for text without tokens', () => {
		expect(tokenizeSegments('')).toEqual([]);
		expect(tokenizeSegments('1. 2!\n\n…')).toEqual([]);
	});
});
