import type { Token } from './Token.ts';

export type Weight = number;
export type Weights = Readonly<Record<Token, Weight>>;
