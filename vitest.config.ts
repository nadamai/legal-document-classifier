import { playwright } from '@vitest/browser-playwright';
import {
	defineConfig,
	type TestProjectInlineConfiguration,
	type ViteUserConfig
} from 'vitest/config';

type BrowserOptions = NonNullable<
	NonNullable<TestProjectInlineConfiguration['test']>['browser']
>;

// A new object per project: Vitest writes the project name into it.
function chromium(): BrowserOptions {
	return {
		enabled: true,
		provider: playwright(),
		headless: true,
		instances: [{ browser: 'chromium' }]
	};
}

const config: ViteUserConfig = defineConfig({
	resolve: { tsconfigPaths: true },
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: { label: 'unit-node', color: 'green' },
					include: ['test/unit/node/**/*.test.ts'],
					environment: 'node'
				}
			},
			{
				extends: true,
				test: {
					name: { label: 'unit-browser', color: 'cyan' },
					include: ['test/unit/browser/**/*.test.ts'],
					browser: chromium()
				}
			},
			{
				extends: true,
				test: {
					name: 'e2e',
					include: ['test/e2e/**/*.test.ts'],
					browser: chromium()
				}
			}
		]
	}
});

export default config;
