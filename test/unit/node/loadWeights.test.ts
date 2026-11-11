import { describe, expect, it } from 'vitest';
import { loadWeights } from '../../../src/model/loadWeights';
import { SUPPORTED_LANGUAGES } from '../../../src/model/supportedLanguages';
import type { Weights } from '../../../src/types/Weights';

describe('loadWeights', () => {
	it.each(SUPPORTED_LANGUAGES)(
		'loads the bundled %s weights',
		async (language: string) => {
			const weights: Weights = await loadWeights(language);

			expect(Number.isFinite(weights.bias)).toBe(true);
			expect(Object.keys(weights.weights).length).toBeGreaterThan(0);
		}
	);

	it('throws for a language without weights, with the failed import as cause', async () => {
		const error: unknown = await loadWeights('jp').catch(
			(reason: unknown): unknown => reason
		);

		expect(error).toBeInstanceOf(Error);
		expect(error).toHaveProperty('message', 'Unsupported language: "jp"');
		expect(error).toHaveProperty('cause');
	});

	it('never falls back to another language for a region code', async () => {
		await expect(loadWeights('en-GB')).rejects.toThrow(
			'Unsupported language: "en-GB"'
		);
	});
});
