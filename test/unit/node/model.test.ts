import { describe, expect, it } from 'vitest';
import { isWeights } from '../../../src/model/isWeights';
import { predictProbability } from '../../../src/model/predictProbability';
import { sigmoid } from '../../../src/model/sigmoid';
import type { FeatureVector } from '../../../src/types/FeatureVector';

describe('sigmoid', () => {
	it('is 0.5 at 0 and symmetric', () => {
		expect(sigmoid(0)).toBe(0.5);
		expect(sigmoid(2) + sigmoid(-2)).toBeCloseTo(1, 15);
	});

	it('stays finite and within [0, 1] for extreme inputs', () => {
		expect(sigmoid(1000)).toBe(1);
		expect(sigmoid(-1000)).toBe(0);
		expect(Number.isNaN(sigmoid(-1000))).toBe(false);
	});
});

describe('predictProbability', () => {
	it('is sigmoid(bias + Σ weight × value)', () => {
		const features: FeatureVector = new Map([
			['privacy', 0.6],
			['policy', 0.8]
		]);

		expect(
			predictProbability(features, {
				bias: -1,
				weights: { privacy: 2, policy: 0.5 }
			})
		).toBeCloseTo(sigmoid(-1 + 2 * 0.6 + 0.5 * 0.8), 15);
	});

	it('counts tokens without a weight as 0', () => {
		const features: FeatureVector = new Map([['unknown', 1]]);

		expect(predictProbability(features, { bias: 0.3, weights: {} })).toBe(
			sigmoid(0.3)
		);
	});

	it('never reads weights from Object.prototype', () => {
		const features: FeatureVector = new Map([
			['constructor', 1],
			['toString', 1],
			['__proto__', 1]
		]);

		expect(predictProbability(features, { bias: 0, weights: {} })).toBe(0.5);
	});
});

describe('isWeights', () => {
	it('accepts a finite bias and finite weights', () => {
		expect(isWeights({ bias: -1, weights: {} })).toBe(true);
		expect(isWeights({ bias: 0, weights: { a: 1.5, 'b c': -2 } })).toBe(true);
	});

	it.each([
		['null', null],
		['a number', 1],
		['an array', []],
		['a missing bias', { weights: {} }],
		['a missing weights map', { bias: 0 }],
		['a string bias', { bias: '1', weights: {} }],
		['a NaN bias', { bias: Number.NaN, weights: {} }],
		['an infinite weight', { bias: 0, weights: { a: Infinity } }],
		['a string weight', { bias: 0, weights: { a: '1' } }],
		['an array of weights', { bias: 0, weights: [1, 2] }],
		['null weights', { bias: 0, weights: null }]
	])('rejects %s', (_name: string, value: unknown) => {
		expect(isWeights(value)).toBe(false);
	});
});
