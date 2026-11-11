# Architecture

## Repository layout

Update this tree when files are added or removed.

```
.
├── .github/                 Dependabot config, plus workflows: CI, npm publish, dev-dependency auto-merge
├── .husky/pre-commit        typecheck, then Prettier on staged files
├── .vscode/settings.json    Python extension uses training/.venv
├── .prettierrc, .prettierignore
├── AGENTS.md                instructions for coding agents
├── CLAUDE.md                imports AGENTS.md
├── docs/                    detail behind AGENTS.md (this file, classifier, extraction, training, data and licensing)
├── package.json             ESM ("type": "module"), "main": "index.ts", no exports field
├── tsconfig.json
├── tsdown.config.ts         builds minified dist/index.js + one chunk per weights file, and dist/extractor.iife.js
├── vitest.config.ts         three test projects: unit-node (Node), unit-browser and e2e (headless Chromium)
├── LICENSE                  MIT
├── README.md                usage, held-out results, contributing
├── dist/                    gitignored: npm run build output
├── src/
│   ├── index.ts             exports only predictWebLegalDocumentProbability, configure and their types
│   ├── predictWebLegalDocumentProbability.ts   the public function: document + language (default en) → extractPage → p
│   ├── configure.ts         the public setup: global custom weights per language (URL or object)
│   ├── extraction/          extractPage: rendered document → Page (see extraction.md)
│   ├── features/            tokenizer (words + legal symbols, in segments), token and pair features
│   ├── model/               predictWebLegalDocumentFeaturesProbability.ts (Page → features → p),
│   │                        loadWeights.ts (custom weights, else import(`../weights/${language}.json`), throws for other languages),
│   │                        customWeights.ts (configured sources, fetch and cache), isWeights.ts (runtime shape check),
│   │                        predictProbability.ts (weighted sum → sigmoid), sigmoid.ts
│   ├── types/               one main type per file, plus its aliases: Page, Weights, FeatureVector, Token, SupportedLanguage, Configuration
│   └── weights/             <lang>.json only ({ bias, weights: token → weight })
├── tools/
│   ├── featurize.ts         run with tsx: JSON lines of pages on stdin → features on stdout
│   └── tsconfig.json        extends the root config with Node types
├── test/                    see testing.md
│   ├── unit/                unit tests: node/ runs in Node, browser/ in Chromium
│   ├── e2e/                 the built package and dist/extractor.iife.js on rendered pages, in Chromium
│   ├── common/              shared by the tests: fixtures/ (hand-written pages and weights), snapshots/, renderPage.ts
│   └── tsconfig.json        extends the root config with Node types, also covers vitest.config.ts
└── training/
    ├── requirements.txt     pinned: scikit-learn 1.9.1, numpy 2.5.4, playwright 1.64.1, protego 0.7.0, publicsuffixlist 1.1.2.20261109 (Python 3.12+)
    ├── setup.sh             npm run train:setup: picks a Python 3.12+, creates .venv, installs Chromium
    ├── common.py            paths, labels, CSV format, what counts as a site, the per-language loop
    ├── scrape.py            data/urls/<lang>/*.txt → extractor.iife.js in headless Chromium → data/contents/<lang>/*.csv
    ├── scrape_all.py        runs scrape.py's scraping for every language folder in data/urls/
    ├── train.py             data/contents/<lang>/*.csv → featurize.ts → drop features on < N sites → logistic regression → 2,000 strongest, refit → src/weights/<lang>.json
    ├── train_all.py         runs train.py's training for every language folder in data/contents/
    ├── evaluate.py          train.py's fitting, 5-fold by site → held-out precision and recall, data/review/<lang>.csv
    ├── .venv/               gitignored: Python environment (npm run train:setup)
    └── data/                gitignored, never published
        ├── urls/<lang>/     legal.txt, not-legal.txt: one URL per line
        ├── contents/<lang>/ legal.csv, not-legal.csv: page texts (url;title;h1;h2;content)
        └── review/<lang>.csv every page's held-out p, likeliest wrong labels first (npm run evaluate)
```

## Data flow

1. `training/scrape.py` opens each URL from `training/data/urls/<lang>/*.txt` in headless Chromium (Playwright) and runs `dist/extractor.iife.js` (the package's own `extractPage`) to get the page's main text, title and headings ([training.md](training.md#scraping)). Each page is filed under its URL list's language, without detecting it.
2. `training/train.py` reads the pages and pipes them through `tools/featurize.ts`, which computes the features with the package's own `src/features`.
3. `train.py` fits the logistic regression and writes `src/weights/<lang>.json` ([training.md](training.md#pipeline)).

## TypeScript and Python boundary

- The two sides exchange only data, never code. `train.py` pipes pages (`content`, `title`, `h1`, `h2`, the same fields as the `Page` type) into `tools/featurize.ts` and reads the features back as JSON lines. It then writes the weights as JSON.
- There is exactly one implementation of tokenizing and features, and it is in TypeScript. Python never computes a feature, so the two sides can't drift apart.
- Dependencies go one way. Python depends on `tools/` and on `dist/extractor.iife.js`. TypeScript depends on Python only through `src/weights/*.json`.
- `src/model/loadWeights.ts` imports `<lang>.json` dynamically and returns it as `Weights`. The import path contains a variable, so TypeScript types it as `any`, and the JSON's shape isn't type-checked.

## Packaging

- TypeScript, published as compiled JavaScript with `.d.ts` files, never raw `.ts`.
  - Consumers written in strict TypeScript need the types.
  - Bundlers don't compile TypeScript inside `node_modules` by default, and Node refuses to strip types there.
- `"type": "module"`, ESM only, with no CommonJS build.
  - Dynamic imports become separate chunks only with ES modules.
  - Node 20.19+ and 22.12+ can `require()` an ES module, so CommonJS consumers are still covered.
  - A dual build would double the output and risk loading the package twice.
- Target `package.json` shape:

  ```json
  {
  	"type": "module",
  	"exports": {
  		".": {
  			"types": "./dist/index.d.ts",
  			"import": "./dist/index.js"
  		}
  	},
  	"files": ["dist"],
  	"sideEffects": false
  }
  ```

- **Bundled weights:**
  - They aren't a public entry point.
  - At build time, tsdown emits each file in `src/weights/` as its own chunk (for example `dist/en-<hash>.js`), plus a lookup table of those chunks. See [Toolchain](#toolchain).
  - A consumer's bundler keeps that chunk separate, and it's fetched only on the first `predictWebLegalDocumentProbability` call for that language.
  - All bundled languages ship inside the package. Custom weights from `configure` are fetched at runtime with `fetch`, or passed as objects, and are never part of the build.
- **`dist/extractor.iife.js`:** a second, separate build of `extractPage` only, as a classic browser script that defines the global `LegalDocumentExtractor`. It's for the training scraper, which runs it in pages through Playwright. It isn't listed in `exports`, and it contains no weights (about 3 KB).

## Toolchain

Chosen for speed. Installed, all pinned exact: `typescript` 7.0.2, `tsdown` 0.23.7, `rolldown` 1.3.0, `tsx` 4.23.15, `vitest` 5.1.0 with `@vitest/browser-playwright` 5.1.0, `vite` 8.3.5, `playwright` 1.64.1 and `@types/node`.

- **Type-checking: TypeScript 7** (`typescript@7`, pinned exact).
  - This is the native compiler written in Go, and its `tsc` is the Go binary. No Rust tool type-checks TypeScript.
  - It only checks types (`noEmit`) and never writes output.
  - Don't install `@typescript/native-preview` (the `tsgo` command). It was the preview and is no longer updated.
- **Build: tsdown**, built on Rolldown and Oxc (Rust).
  - It bundles `src/` into `dist/` and writes the `.d.ts` files.
  - With `isolatedDeclarations` on, it writes each `.d.ts` from its own source file without running the type checker.
- **tsdown output extensions.** By default tsdown writes `.mjs` and `.d.mts`, because `fixedExtension` defaults to true for `platform: 'node'`. `tsdown.config.ts` sets `fixedExtension: false`, so the output is `dist/index.js` and `dist/index.d.ts`, as in the target `package.json` shape above.
- **Minified, without comments.** `tsdown.config.ts` sets `minify: true` and `outputOptions: { comments: false }`.
  - `dist/*.js` contains no comments at all, not even `@__PURE__` annotations.
  - The `.d.ts` files keep their JSDoc, which is how consumers see the docs in their editor.
- **Weights chunks.** `tsdown.config.ts` adds two Rolldown plugins, `dynamicImportVarsPlugin` and `importGlobPlugin`.
  - Together they turn ``import(`../weights/${language}.json`)`` in `src/model/loadWeights.ts` into one chunk per file in `src/weights/`, plus a lookup table of those chunks.
  - A new weights file gets its chunk without any change to `loadWeights`; only `SupportedLanguage` needs its code. A language without a file isn't in the table, so its import fails and `loadWeights` throws.
  - The path must keep a fixed folder and extension, with the variable as the file name only. Otherwise the plugins can't expand it.
  - Without the plugins, tsdown leaves the variable import untouched, and the built package throws for every language.
  - Both plugins come from `rolldown/experimental` and may change between Rolldown releases. That's why `rolldown` is a direct dev dependency, pinned to the exact version tsdown uses (1.3.0).
- **tsx** runs TypeScript source: manual checks and `tools/*.ts`. It uses esbuild, so it doesn't depend on TypeScript's JavaScript API.
  - Plain `node` can't run `src/`, because relative imports have no extension.
  - A script must be inside an ES module package (this repo has `"type": "module"`), or top-level `await` fails.
  - For one-liners, use `npx tsx --input-type=module -e "…"`. Plain `-e` runs as CommonJS, which rejects top-level `await`.
  - `npx tsx` with no file starts a REPL.
- **`@types/node`** is for `tools/` and `test/` only. `src/` runs in the browser and must not use Node APIs. The root `tsconfig.json` has `"types": []`, so a Node global in `src/` fails the type-check.
- **Tests: Vitest** ([testing.md](testing.md)). One runner covers Node unit tests and, in browser mode with the Playwright provider, real Chromium. It transforms TypeScript itself and doesn't load TypeScript's JavaScript API, so it works with TypeScript 7.
  - `vite` is a direct dev dependency, pinned so Vitest's server can't change underneath it. It brings its own Rolldown, separate from the one pinned for tsdown.
  - `playwright` (npm) is pinned to the same version as `playwright` in `training/requirements.txt`, so the tests and the scraper use one Chromium build. Update the two together.
- **No TypeScript JavaScript API.** TypeScript 7's package exposes no stable compiler API. Tools that load TypeScript as a library (tsup's `.d.ts` generation, typescript-eslint, ts-node and similar) may not work. Check that a tool supports TypeScript 7 before adding it.
- **Not used, and why:**
  - TypeScript 6: slower. Only tools that need the JavaScript API require it.
  - tsup: its `.d.ts` generation needs that API.
  - esbuild with `tsc --emitDeclarationOnly`: two tools, and the declarations go through the type checker.
- **Formatting:** Prettier with `.prettierrc`.
  - `prettier-plugin-jsdoc` wraps `/** */` comments at `printWidth`, which Prettier itself never does. Comments that fit become one line. `//` comments are left as written.
  - `prettier:check` checks `{src,tools,test}/**/*.ts`.
  - `prettier` runs pretty-quick on the staged `{src,tools,test}/**/*.ts` files and stages the result again.
- **Pre-commit hook:** `.husky/pre-commit` runs `npm run typecheck`, then `npm run prettier`. A type error aborts the commit. The `prepare` script installs husky.
  - The hook calls the npm scripts rather than binaries, so it checks exactly what `npm run typecheck` checks.
  - Never call `npx tsgo` in the hook. No `tsgo` binary is installed, so `npx` would look the name up on the npm registry. That fails today and blocks every commit. If someone ever publishes a package under that name, `npx` in a hook with no terminal would install it and run it without asking.
- **CI** (`.github/workflows/ci.yml`): on pushes and pull requests to `main`, except changes to Markdown files or `.gitignore` alone. One job runs `prettier:check`, `typecheck` and `build`. A second job then installs only Chromium's headless shell, without `--with-deps` because the runner image already has its system libraries, and runs `npm test`. The publish workflow installs it the same way. Both use the current Node LTS.
- **Publishing** (`.github/workflows/publish.yml`): a published GitHub release runs the same checks and tests, then `npm publish --provenance --access public`, which authenticates with npm's trusted publishing (OIDC).
- **Dependency updates:** Dependabot opens weekly npm update PRs, waiting 7 days after each release (`.github/dependabot.yml`). PRs with `(deps-dev)` in the title are auto-merged by `.github/workflows/dependabot-automerge.yml`. Runtime dependencies aren't allowed at all.
- **Scripts:**
  - `typecheck` runs `tsc && tsc -p tools && tsc -p test`, and `build` runs `tsdown`.
  - `test` runs `npm run build`, then `vitest run`.
  - `prettier:check` and `prettier` handle formatting.
  - `train:setup` runs `training/setup.sh`, which creates the Python environment and installs Playwright's Chromium. `train` runs `training/train.py` for the given languages, and `train:all` runs `training/train_all.py` for every language folder. `evaluate` runs `training/evaluate.py`. All three take `--min-sites`, `--max-weights` and `--c`.
  - `scrape` and `scrape:all` run `npm run build` first, so the scraper always injects an extractor built from the current source.
  - All are listed under Commands in AGENTS.md.
- Open: the minimum Node version for the tools.

### tsconfig.json

The file itself is the source of truth. This section explains why each option is set.

**Scope.** The root `tsconfig.json` covers `src/` only, which is browser code. `tools/tsconfig.json` extends it, sets `"types": ["node"]` and includes `tools/*.ts`. `test/tsconfig.json` does the same for `test/` and `vitest.config.ts`. `npm run typecheck` checks all three configs. A single config with Node types would let browser code use Node APIs without an error.

**Options:**

- **Environment:**
  - `target` and `lib` are ES2022, plus `DOM`. Everything in ES2022 runs in Chrome 114, and it includes the `Intl.Segmenter` types.
  - Don't raise `lib` above ES2023: ES2024 adds APIs Chrome 114 lacks, such as `Object.groupBy`.
  - TypeScript 7 includes the DOM iterable types in `DOM`, so `DOM.Iterable` isn't needed.
  - `"types": []` keeps Node globals out of `src/`.
- **Modules:**
  - `module: "ESNext"` with `moduleResolution: "Bundler"`. Relative imports have no extension, and tsdown and tsx resolve them. Plain Node can't, so it can't run `src/`.
  - `moduleDetection: "force"` treats every file as a module.
- **Per-file compilation:**
  - `erasableSyntaxOnly`, `verbatimModuleSyntax` and `isolatedModules` let tsx and tsdown compile each file on its own.
  - An import ending in `.ts` fails the type-check (it would need `allowImportingTsExtensions`).
  - Type-only imports use `import type`, so a per-file compiler knows it can drop them.
  - No enums, namespaces or constructor parameter properties.
- **Declarations:**
  - `noEmit`: `tsc` only checks, and tsdown writes `dist/`.
  - `isolatedDeclarations`, which needs `declaration`, lets tsdown write `.d.ts` files without the type checker. Exported functions and values need explicit types.
- **Strictness:**
  - `strict`, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals` and `noUnusedParameters`.
  - With `noUncheckedIndexedAccess`, an index lookup such as `weights[word]` may be `undefined`.
  - Parameters that are deliberately unused start with `_`.
  - There is no linter (typescript-eslint may not support TypeScript 7), so the compiler is what catches unused code.
- **Aliases:** none yet. If you add any, check that `tsc`, tsx and tsdown all resolve them.
- **JSON imports** use the standard import attribute: ``import(`../weights/${language}.json`, { with: { type: 'json' } })`` in `src/model/loadWeights.ts`. tsx and tsdown would also accept the import without it.

**What this config rejects:**
- Node globals in `src/`
- ES2024 APIs
- enums
- type imports without `import type`
- relative imports ending in `.ts`
- exports without explicit types
- unchecked index access
