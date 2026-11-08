import type { Token } from './Token';

export type Weight = number;
export type TokenWeights = Readonly<Record<Token, Weight>>;

export type Weights = Readonly<{
	bias: Weight;
	weights: TokenWeights;
}>;
