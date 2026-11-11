# Testing

`npm test` builds the package, then runs Vitest (`vitest.config.ts`) with three projects. No test reads `training/data/`, so the suite runs without the private training data. The Python training code has its own pytest suite ([training tests](#training-tests)).

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

## Training tests

`npm run test:training` builds, then runs pytest (`training/pytest.ini`) on `training/tests/` with `training/.venv/bin/python`. CI runs it in its own job on Python 3.12, the oldest supported version. Like the Vitest suite, it never reads `training/data/`: the `data_root` fixture in `conftest.py` points `URLS`, `CONTENTS` and `REVIEW` at a temporary folder, and `helpers.py` writes hand-written URL lists and page CSVs there.

| File | Covers |
| --- | --- |
| `test_common.py` | URL lists, what counts as a site, language codes and folders, the per-language loop |
| `test_scrape.py` | robots.txt for this scraper and each AI-training crawler, unreachable robots.txt, the `tdm-reservation` header, redirects, error and robot-check pages, resuming, and the CSV round trip into `train.read_pages`, with fake responses and no browser |
| `test_scrape_browser.py` | `scrape_page` end to end in headless Chromium with `dist/extractor.iife.js`, against a local server: a policy page is extracted, and pages disallowed by robots.txt (also after a redirect), with a `tdm-reservation` meta tag or header, a robot check, a 404 or a redirect home are skipped |
| `test_train.py` | reading pages, `tools/featurize.ts` through tsx, dropping features on too few sites, `--max-weights`, rounding, and the weights file: its order, its bytes between runs, and that it gives exactly the `p` that `train.py` reports |
| `test_evaluate.py` | no page is scored by a model that saw its site, the 99%-precision threshold, the review CSV |

- The browser tests need `npm run build` (the script does it) and Playwright's Chromium from `npm run train:setup`.
- Feature sets in `test_train.py` and `test_evaluate.py` are hand-written dicts, and `test_train.py` gets real ones only from `tools/featurize.ts`. Python never computes features, not even in tests.
- The robots.txt and `tdm-reservation` tests guard a hard rule. A change that loosens those checks must fail them.

## Fixtures

`test/common/fixtures/` holds hand-written pages and weights only ([data-and-licensing.md](data-and-licensing.md#test-fixtures)). Never paste text from real sites into tests.
