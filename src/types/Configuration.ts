import type { Weights } from './Weights';

export type WeightsSource = string | URL | Weights;

export type Configuration = Readonly<{
	weights?: Readonly<Record<string, WeightsSource>>;
}>;
