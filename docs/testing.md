# Testing

`npm test` builds the package, then runs Vitest (`vitest.config.ts`) with three projects. No test reads `training/data/`, so the suite runs without the private training data.

| Project | Where | Runs in | Covers |
| --- | --- | --- | --- |
| `unit-node` | `test/unit/node/` | Node | tokenizer, features and the feature snapshot, model arithmetic, weights validation, `loadWeights`, custom weights, sanity bounds on the bundled weights |
| `unit-browser` | `test/unit/browser/` | headless Chromium | `extractPage`, rule by rule, on hand-written pages |
| `e2e` | `test/e2e/` | headless Chromium | the built package from `dist/` on rendered pages, and `dist/extractor.iife.js` |

Folders are named by the kind of test, and unit tests by where they run: a unit test that needs a real browser (layout, computed styles, `checkVisibility()`) goes in `test/unit/browser/`, and runs in Chromium through Vitest's browser mode with the Playwright provider. `test/common/` holds what several tests share: fixtures, snapshots and `renderPage.ts`.

## Running

- `npm test` runs everything once. It builds first, because the e2e tests import `dist/index.js` and `dist/extractor.iife.js`.
- `npx vitest --project unit-node` runs only the Node unit tests, in watch mode. Unit tests test the source, so they need no build.
- The browser projects need Playwright's Chromium. `npm run train:setup` installs it, or run `npx playwright install chromium`.
- `.vitest/` holds failure screenshots and is gitignored.

## Feature snapshot

`test/unit/node/extractFeatures.test.ts` compares the features of a few fixed pages with `test/common/snapshots/features.json`. It fails on any change to the tokenizer or the features, even one the other tests miss. The features changed, so:

1. retrain the weights in the same change (hard rule),
2. update the snapshot with `npx vitest run --project unit-node -u`, and check its diff.

It doesn't depend on the weights, so a retrain alone never changes it.

## Bundled weights

`test/unit/node/bundledWeights.test.ts` and `test/e2e/package.test.ts` check only wide bounds on obvious pages: legal documents above 0.9, product pages below 0.5. They aren't a benchmark; `npm run evaluate` measures the model ([training.md](training.md#evaluation)). After retraining, run `npm test`: a retrain that breaks these bounds has gone badly wrong.

## Browser tests

- Each page is rendered in its own `1280×800` iframe from `srcdoc` (`test/common/renderPage.ts`), so styles and layout never leak between tests.
- `test/unit/browser/extractPage.test.ts` has a test for each rule in [extraction.md](extraction.md#how-it-works). A change to a rule changes its test.
- `test/e2e/package.test.ts` imports the built `dist/index.js`, which proves that the weights chunks load, and that custom weights resolve a relative URL against the page. It also checks that `dist/extractor.iife.js`, which the scraper runs, extracts exactly what the source `extractPage` does.

## Fixtures

`test/common/fixtures/` holds hand-written pages and weights only ([data-and-licensing.md](data-and-licensing.md#test-fixtures)). Never paste text from real sites into tests.
