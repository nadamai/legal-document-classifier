# AGENTS.md

Instructions for AI coding agents working in this repository. This file holds what is true **now** and points to `docs/` for detail. Read [Maintaining these instructions](#maintaining-these-instructions) before editing it.

## What this project is

This repository is an open-source TypeScript library that decides whether a web page is a web legal document: a website's terms of service, privacy policy, cookie policy, e-commerce promotion rules and similar. It isn't meant for legal documents outside the web (e.g. property or vehicle sale contracts). Given a rendered page's `document` and its language (default `en`), it returns a probability `p` in [0, 1]. It reads the page's main text, title and `h1` and `h2` headings with `extractPage`, the same function the training scraper uses. A page without text gives `0`. Developers can set their own weights per language, from a URL or an object, with `configure`. A language with neither bundled nor custom weights throws an error. The weights are trained in Python inside this repo. The classifier itself runs as plain JavaScript.

## Current assumptions

Each line is a decision that may change. Details, reasons and open questions are in the linked docs.

1. **Model:** one logistic regression per language. A weights file holds a bias and a token → weight map, and `p = sigmoid(bias + Σ weight × value)`. A token is a word or a legal symbol such as `§`. Features are tokens plus pairs of neighbouring tokens (e.g. `privacy policy`). Title and `h1` features carry a field prefix (`title:privacy`, `h1:privacy`), so they have their own weights. `h2` shares the content weights. [docs/classifier.md](docs/classifier.md#model)
2. **Language:** the caller passes a language code and decides how to determine it; it defaults to `en`. By default it's typed `SupportedLanguage` (`src/types/SupportedLanguage.ts`), the bundled languages. For languages with custom weights, the caller names the allowed set as the type argument (`<SupportedLanguage | 'de'>`, or `<string>`). A language with neither bundled nor custom weights throws, so callers map or skip unsupported languages themselves. [docs/classifier.md](docs/classifier.md#language-handling)
3. **A number or an error:** `predictWebLegalDocumentProbability` never returns `null`. It throws only for a language without weights, or when custom weights fail to load or are invalid, even on an empty page. A page without tokens returns `0`.
4. **Definition:** a positive is a web page that is itself a web legal document. Pages about legal topics that aren't documents, lists of legal documents, imprints, statutes, contract templates and ordinary pages are negatives. [docs/classifier.md](docs/classifier.md#what-counts-as-a-web-legal-document)
5. **Probabilities only, precision first:** the library returns `p` and no yes/no answer, so callers choose their own threshold. A false positive is worse than a miss, so `npm run evaluate` reports the lowest threshold with at least 99% precision on held-out sites, as guidance. [docs/classifier.md](docs/classifier.md#threshold)
6. **Input is a rendered page:** callers pass the `document`, and `extractPage` reduces it to the main text without navigation, footer, overlays and cookie banners, plus the title and the `h1` and `h2` headings of that same main content. The training scraper uses the same `extractPage`, so callers can't pass text extracted any other way. [docs/extraction.md](docs/extraction.md)
7. **Budget:** under 10 ms per page, up to about 100 KB of weights per language, no WebAssembly, no runtime dependencies. Weights are loaded with a dynamic import, one chunk per language. The code must run in Chrome 114 or later.
8. **Languages:** bundled weights for Polish and English only. Other languages need custom weights.
9. **Toolchain and packaging:** TypeScript source, type-checked with TypeScript 7 (the native Go compiler) and built with tsdown into ESM-only JavaScript with `.d.ts` files. TypeScript source runs through tsx, not plain Node. [docs/architecture.md](docs/architecture.md#toolchain)
10. **Single feature implementation:** Python only fits the weights. All feature code is TypeScript. [docs/architecture.md](docs/architecture.md#typescript-and-python-boundary)
11. **Licensing and data:** MIT for code and weights, with the copyright line in `LICENSE`. The training data stays private: URL lists, labels and page texts live in the gitignored `training/data/`. Only the code, the weights, summary counts and benchmark results are published. [docs/data-and-licensing.md](docs/data-and-licensing.md)
12. **Custom weights:** `configure({ weights })` globally maps languages to weights, each a URL fetched on first use or a weights object, for every later call. Each call replaces the whole set. Custom weights override the bundled ones and can add languages. A failed load throws and is retried on the next call, never falling back to the bundled weights. [docs/classifier.md](docs/classifier.md#custom-weights)

## Hard rules

Do not break these without the maintainer's explicit agreement.

- Never compute features in Python. Python reads the features written by `tools/featurize.ts`.
- Any change to the tokenizer or the feature code changes the features, so retrain the weights in the same change.
- Training pages are extracted only with `dist/extractor.iife.js`, which is the package's own `extractPage`. Never use another extractor, or text pasted by hand, because production extracts with `extractPage` too.
- Any change to `src/extraction/` changes the features, so retrain the weights in the same change.
- Python writes JSON (the weights), never TypeScript.
- A language without bundled or custom weights throws in `loadWeights`. Never fall back to another language's weights, or from custom weights to bundled ones, and never return `null`.
- Load bundled weights only through ``import(`../weights/${language}.json`)`` in `src/model/loadWeights.ts`, which the build turns into one chunk per weights file. Never add a static import or a per-language table in code. Adding a bundled language means adding its JSON file and its code to `SupportedLanguage`, nothing else. Custom weights come only from `configure`.
- `src/weights/` contains only the weights dictionaries (`<lang>.json`), no code.
- The scraper skips every page that `robots.txt` disallows, for its own token or for the AI-training crawlers it lists, and every page with a TDMRep `tdm-reservation`. Never remove or loosen these checks: they keep the scraping within the EU text-and-data-mining exception ([docs/data-and-licensing.md](docs/data-and-licensing.md#scraping)).
- Never commit scraped page text, scraped HTML, or anything under `training/data/`, the URL lists included. Test fixtures are hand-written or redistributable content only.
- `src/index.ts` contains no logic, and exports only `predictWebLegalDocumentProbability`, `configure` and their types. Only public entry points sit directly in `src/`; everything internal lives in its subfolders.
- `package.json` has no runtime `dependencies`.

## Code style

- TypeScript in strict mode, plus the extra checks in `tsconfig.json` ([docs/architecture.md](docs/architecture.md#tsconfigjson)). Use explicit types and no type casts. Exported functions and values always have explicit types, which `isolatedDeclarations` requires.
- Only erasable syntax: no enums, namespaces or constructor parameter properties. Type-only imports use `import type`.
- `src/` runs in the browser and must not use Node APIs. The type-check enforces this.
- Before adding a dev tool, check that it supports TypeScript 7. Tools that load TypeScript's JavaScript API (tsup's `.d.ts` generation, typescript-eslint, ts-node) may not.
- Keep `rolldown` pinned to the exact version tsdown depends on, and update the two together.
- Types live in `src/types/`, one main type per file. A file also holds the aliases only its main type uses: `Weights.ts` has `Weight` and `TokenWeights`, and `FeatureVector.ts` has `FeatureValue`. An alias shared by several types gets its own file (`Token.ts`). Import an alias from its file instead of declaring it again.
- Module-level constants always go at the top of the file, right after the imports and before any function, even when only one function uses them.
- Files in `src/types/` hold only imports and type declarations, with no comments of any kind (no JSDoc, no `//` or `/* */`). Explain a type where it's used, or in `docs/`.
- Elsewhere, comment only what the names and code don't already say: a non-obvious reason, a constraint that's easy to break, or a TODO. A well-named constant or function gets no comment: `MIN_MAIN_TEXT_SHARE` needs none. When in doubt, leave it out. Keep comments to one or two lines, and never restate a name, a signature or the code below.
- Relative imports have no extension (`./tokenize`), except data files (`./weights/en.json`). An import ending in `.ts` fails the type-check. Because of this, plain `node` can't run `src/`; use tsx ([docs/architecture.md](docs/architecture.md#toolchain)).
- Format with Prettier using `.prettierrc`: tabs, single quotes, semicolons, no trailing commas, 80 columns. Check with `npm run prettier:check`. `prettier-plugin-jsdoc` also wraps `/** */` comments at 80 columns, and puts short ones on one line. `//` comments aren't wrapped, so keep them within 80 columns yourself.
- Python dependencies are pinned in `training/requirements.txt`.

## Commands

| Command                  | What it does                                              |
| ------------------------ | --------------------------------------------------------- |
| `npm run typecheck`      | Type-checks `src/`, `tools/` and `test/` with TypeScript 7, no output |
| `npm run build`          | Builds `dist/` with tsdown: the package, plus `extractor.iife.js` for the scraper |
| `npm run prettier:check` | Checks the formatting of `src/`, `tools/` and `test/`     |
| `npm run prettier`       | Formats staged `.ts` files in `src/`, `tools/` and `test/` (pretty-quick) |
| `npm test`               | Builds, then runs Vitest: unit tests in Node and in headless Chromium, and e2e tests of the built package ([docs/testing.md](docs/testing.md)) |
| `npx tsx <file>.ts`      | Runs TypeScript source, e.g. a manual check (`npx tsx` alone starts a REPL) |
| `npm run train:setup`    | Creates `training/.venv` with Python 3.12+ (`$PYTHON`, else `python3`, else the newest `python3.X`), installs `training/requirements.txt` and Playwright's Chromium |
| `npm run scrape [-- <lang> …]` | Builds, then scrapes `training/data/urls/<lang>/*.txt` into `training/data/contents/<lang>/*.csv` (default `en`), skipping URLs already there |
| `npm run scrape:all`     | Builds, then scrapes every language that has a folder in `training/data/urls/` |
| `npm run train [-- [options] <lang> …]` | Trains each given language from `training/data/contents/<lang>/*.csv` into `src/weights/<lang>.json` (default `en`). Options: `--min-sites` (5), `--max-weights` (2,000), `--c` (1.0) |
| `npm run train:all [-- options]` | Trains every language that has a folder in `training/data/contents/` |
| `npm run evaluate [-- [options] <lang> …]` | Scores each language's pages with models that never saw their site (default: every language), prints precision and recall, and writes `training/data/review/<lang>.csv` |

Add each script here once it works.

## Out of scope

- Legal documents outside the web, such as property or vehicle sale contracts. The library classifies web legal documents only.
- Telling document categories apart (privacy policy vs terms).

## Docs

| File                                                     | Covers                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)             | Layout, data flow, TypeScript/Python boundary, packaging, toolchain |
| [docs/classifier.md](docs/classifier.md)                 | Definition, API, input, language, model, features, weights          |
| [docs/extraction.md](docs/extraction.md)                 | `extractPage`: cleaning a rendered page, use from Playwright        |
| [docs/training.md](docs/training.md)                     | Dataset, scraping, training, evaluation, retraining                 |
| [docs/data-and-licensing.md](docs/data-and-licensing.md) | Licenses, what may be published, scraping rules                     |
| [docs/testing.md](docs/testing.md)                       | Test layers, feature snapshot, browser tests, fixtures              |

## Maintaining these instructions

These files describe the project as it is now. Update them as part of the change that makes them out of date.

- **Update the docs only when something changes:** the code changes, or the maintainer asks for a change or states a decision (a tool, a rule, a scope change). Then update AGENTS.md and the relevant docs in the same turn, without being asked.
- **A question changes nothing.** Answer it without editing docs or code, even when the answer comes from a measurement or an experiment. Record a finding only if the maintainer asks for it.
- **Assumptions change through the maintainer.** If a task would contradict a current assumption or a hard rule, stop and ask. Once it is agreed, update the matching line above and the relevant doc.
- **No development history.** No change logs, dated decision entries or "previously…" notes. A short reason next to a current choice is fine. Open questions go in the doc for their topic.
- **Keep AGENTS.md short.** It holds a summary, one line per assumption, the hard rules, the style rules, the commands and the docs index. When a section here passes about 15 lines, or a topic grows its own rules, move the detail to `docs/<topic>.md`, leave a one-line pointer, and add the file to the table above.
- **Commands are real.** List a command only once it exists and works.
