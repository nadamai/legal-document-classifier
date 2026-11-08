import {
	dynamicImportVarsPlugin,
	importGlobPlugin
} from 'rolldown/experimental';
import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['src/index.ts'],
	fixedExtension: false,
	plugins: [dynamicImportVarsPlugin(), importGlobPlugin()]
});
