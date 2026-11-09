import {
	dynamicImportVarsPlugin,
	importGlobPlugin
} from 'rolldown/experimental';
import { defineConfig } from 'tsdown';

export default defineConfig([
	{
		entry: ['src/index.ts'],
		fixedExtension: false,
		minify: true,
		outputOptions: { comments: false },
		plugins: [dynamicImportVarsPlugin(), importGlobPlugin()]
	},
	{
		entry: { extractor: 'src/extraction/extractPage.ts' },
		format: 'iife',
		globalName: 'LegalDocumentExtractor',
		platform: 'browser',
		dts: false,
		clean: false,
		minify: true,
		outputOptions: { comments: false }
	}
]);
