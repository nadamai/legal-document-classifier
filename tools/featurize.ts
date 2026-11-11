import { createInterface, type Interface } from 'node:readline';
import { extractFeatures } from '~/src/features/extractFeatures';
import type { FeatureVector } from '~/src/types/FeatureVector';
import type { Page } from '~/src/types/Page';

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
