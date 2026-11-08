import type { Token } from './Token';

export type Weight = number;
export type Weights = Readonly<Record<Token, Weight>>;
