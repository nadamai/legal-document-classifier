import { createInterface, type Interface } from 'node:readline';
import { extractFeatures } from '../src/features/extractFeatures';
import type { FeatureVector } from '../src/types/FeatureVector';
import type { Page } from '../src/types/Page';

// Reads one page per line on stdin, as JSON `{ content, title, h1, h2, h3 }`,
// and writes one JSON line of features `{ token: value }` per page, in the
// same order. training/train.py calls it, so features only ever come from the
// package's own code.
const lines: Interface = createInterface({
	input: process.stdin,
	crlfDelay: Infinity
});

for await (const line of lines) {
	if (line.trim() === '') {
		continue;
	}

	const page: Page = JSON.parse(line);
	const features: FeatureVector = extractFeatures(page);

	process.stdout.write(`${JSON.stringify(Object.fromEntries(features))}\n`);
}
