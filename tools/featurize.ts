import { createInterface, type Interface } from 'node:readline';
import { extractFeatures } from '../src/features/extractFeatures';
import type { FeatureVector } from '../src/types/FeatureVector';

// Reads JSON lines `{ "text": … }` on stdin and writes one JSON line of
// features `{ token: value }` per text, in the same order. training/train.py
// calls it, so features only ever come from the package's own code.
const lines: Interface = createInterface({
	input: process.stdin,
	crlfDelay: Infinity
});

for await (const line of lines) {
	if (line.trim() === '') {
		continue;
	}

	const { text }: { text: string } = JSON.parse(line);
	const features: FeatureVector = extractFeatures(text);

	process.stdout.write(`${JSON.stringify(Object.fromEntries(features))}\n`);
}
