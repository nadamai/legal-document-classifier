# Web Legal Document Classifier ⚖️

[![npm version](https://img.shields.io/npm/v/@hamurabi/legal-document-classifier)](https://www.npmjs.com/package/@hamurabi/legal-document-classifier)
[![license](https://img.shields.io/npm/l/@hamurabi/legal-document-classifier)](./LICENSE)
[![CI](https://github.com/nadamai/legal-document-classifier/actions/workflows/ci.yml/badge.svg)](https://github.com/nadamai/legal-document-classifier/actions/workflows/ci.yml)

An npm package that tells whether a web page is a web legal document, such as a website's terms of service, privacy policy, cookie policy or store rules, right in the browser. No server, no WebAssembly and no runtime dependencies.

Give it a rendered page's `document`, and it returns the probability `p` (0–1) that the page is a legal document. It reads the page's main content, leaving out navigation, footers, overlays and cookie banners, and scores it with a small per-language model: about 3 KB gzipped of code, plus about 14 KB gzipped of weights for each language, loaded only when that language is first used. English (`en`) and Polish (`pl`) are bundled, and you can [bring your own weights](#other-languages-and-custom-weights) for any language.

| Page | Result |
| --- | --- |
| a legal document itself: terms of service, privacy policy, cookie policy, store rules | high `p` |
| a page about a legal topic that isn't itself a legal document | low `p` |
| a list of legal documents (mostly links to them) | low `p` |
| an imprint, a statute or a contract template | low `p` |
| an ordinary page: home, product, article, help, login | low `p` |

## Installation

```bash
npm install @hamurabi/legal-document-classifier
```

## Examples

### Scoring the current page

```ts
import { predictWebLegalDocumentProbability } from '@hamurabi/legal-document-classifier';

const p = await predictWebLegalDocumentProbability(document, 'en');

if (p >= 0.9) {
	// Very likely a legal document.
}
```

The page must be rendered in a real browser, because extraction relies on layout and computed styles. That covers a page's own scripts, injected scripts and automated browsers such as Playwright or Puppeteer, but not `jsdom` or a `DOMParser` document. The page is never modified.

The language defaults to `en`. The library doesn't detect it: pass the page's language yourself, and map or skip languages without weights. A code from a detector is a `string`, so narrow it first:

```ts
import {
	predictWebLegalDocumentProbability,
	type SupportedLanguage
} from '@hamurabi/legal-document-classifier';

function isSupported(code: string): code is SupportedLanguage {
	return code === 'en' || code === 'pl';
}

const code = document.documentElement.lang.slice(0, 2).toLowerCase();

if (isSupported(code)) {
	const p = await predictWebLegalDocumentProbability(document, code);
}
```

### Choosing a threshold

The library returns `p` only, with no yes/no answer, so you choose where to cut for your own trade-off. A false positive usually costs more than a miss, so start from a threshold with high precision. Measured with `npm run evaluate` on sites the model never saw during training:

| Language | Held-out pages (sites) | AUC | 99% precision from | Legal pages found there |
| --- | --- | --- | --- | --- |
| `en` | 1,153 (533) | 0.928 | `p ≥ 0.893` | 73.2% |
| `pl` | 3,348 (1,163) | 0.975 | `p ≥ 0.860` | 83.3% |

Thresholds differ per language and move with every retrain, so check them again after updating the package.

### Other languages and custom weights

`configure` sets weights of your own, globally, for every later call. A language maps to the URL of a weights JSON file, fetched on first use and cached, or to a weights object. Custom weights replace the bundled ones for their language, and can add languages without bundled weights:

```ts
import {
	configure,
	predictWebLegalDocumentProbability,
	type SupportedLanguage
} from '@hamurabi/legal-document-classifier';

configure({
	weights: {
		de: 'https://cdn.example.com/legal-weights/de.json',
		cs: '/weights/cs.json',
		en: { bias: -1, weights: { privacy: 2.1, 'privacy policy': 1.4 } }
	}
});

const p = await predictWebLegalDocumentProbability<SupportedLanguage | 'de'>(
	document,
	'de'
);
```

- Without a type argument, `language` accepts only the bundled languages. Name the allowed set, as above, to pass others, or use `<string>` for any code.
- Each `configure` call replaces the previous configuration. `configure({})` goes back to the bundled weights.
- A failed load throws, and the next call fetches again. It never falls back to the bundled weights.
- Weights must come from this repository's training (`npm run train`) for the same version of the package, because a version that changes the features needs retrained weights.

### Lazy loading

Import the package on demand with a dynamic `import()`, so none of its code is downloaded until you need it. Bundlers split it into a separate chunk automatically:

```ts
async function checkPage() {
	const { predictWebLegalDocumentProbability } = await import(
		'@hamurabi/legal-document-classifier'
	);

	return predictWebLegalDocumentProbability(document, 'en');
}
```

The weights are lazy either way: each language's weights are a separate chunk, fetched on that language's first call.

### Using without a bundler

The package is a standard ES module, so `<script type="module">` can load it with no build step. Copy the whole `dist/` folder, because the weights chunks are loaded from next to `index.js`:

```html
<script type="module">
	import { predictWebLegalDocumentProbability } from './vendor/legal-document-classifier/dist/index.js';

	const p = await predictWebLegalDocumentProbability(document, 'en');
</script>
```

## Documentation

The package exports two functions and their types:

- `predictWebLegalDocumentProbability(document, language = 'en'): Promise<number>`: the probability that the rendered page is a legal document.
  - Returns `0` for a page without text.
  - Throws for a language without bundled or custom weights, and when custom weights fail to load or are invalid.
  - The same page always gives the same result.
- `configure({ weights }): void`: sets custom weights per language ([see above](#other-languages-and-custom-weights)). Throws for an invalid weights object, and then keeps the previous configuration.
- Types: `SupportedLanguage` (`'en' | 'pl'`), `Configuration`, `WeightsSource` and `Weights` (`{ bias, weights }`).

How it works:

1. **Extraction:** the page's main content (its single `<main>`, or `<body>`), minus navigation, page-level headers and footers, dialogs, fixed overlays, cookie banners of common consent tools and hidden text. The title and the `h1` and `h2` headings are read too.
2. **Features:** words and legal symbols such as `§`, plus pairs of neighbouring words (`privacy policy`). The title and `h1` get weights of their own, because they name the whole document.
3. **Model:** a logistic regression per language, trained in Python with scikit-learn and run as plain JavaScript. `p = sigmoid(bias + Σ weight × value)`.

Scoring a 65,000-character page takes about 2 ms. Extraction adds about 2–16 ms depending on the page, most of it the browser's own style and layout work on the first call. The code runs in Chrome 114 or later.

For the details, see the [docs](https://github.com/nadamai/legal-document-classifier/tree/main/docs):

- [classifier.md](https://github.com/nadamai/legal-document-classifier/blob/main/docs/classifier.md): the definition, API, languages, model, features and weights format
- [extraction.md](https://github.com/nadamai/legal-document-classifier/blob/main/docs/extraction.md): how a rendered page is reduced to its main content
- [training.md](https://github.com/nadamai/legal-document-classifier/blob/main/docs/training.md): scraping, training and evaluation
- [architecture.md](https://github.com/nadamai/legal-document-classifier/blob/main/docs/architecture.md): the layout, packaging and toolchain
- [testing.md](https://github.com/nadamai/legal-document-classifier/blob/main/docs/testing.md): the test suite

## Contributing

Contributions are welcome! A few things to know before diving in:

```bash
npm install                      # install dependencies and the pre-commit hook
npx playwright install chromium  # the browser the tests run in
npm run typecheck                # type-check src/, tools/ and test/
npm test                         # build, then run the unit and e2e tests
```

A pre-commit hook runs the type check and `prettier` automatically. CI runs the same checks and the tests on every pull request.

Tests live in [`test`](https://github.com/nadamai/legal-document-classifier/tree/main/test) and run with [Vitest](https://vitest.dev): unit tests in Node and in headless Chromium, and end-to-end tests of the built package on rendered pages. Test pages are hand-written: never paste text from real sites into them.

Training needs Python 3.12 or later. `npm run train:setup` creates its environment, and `npm run scrape`, `npm run train` and `npm run evaluate` collect page texts, fit the weights and measure them on unseen sites. The training data isn't part of the repository, so bring your own URL lists in `training/data/urls/<lang>/legal.txt` and `not-legal.txt` ([training.md](https://github.com/nadamai/legal-document-classifier/blob/main/docs/training.md)). The scraper skips every page whose `robots.txt` or TDMRep reservation opts out of text and data mining.

When you change the tokenizer, the features or the extraction, please:

- retrain the weights in the same change, because they depend on the exact features,
- update the feature snapshot (`npx vitest run --project unit-node -u`) and check its diff,
- add or update a test for the changed behaviour.

[`AGENTS.md`](https://github.com/nadamai/legal-document-classifier/blob/main/AGENTS.md) holds the project's rules and conventions, for AI coding agents and humans alike.

## License

Licensed under the [MIT](https://github.com/nadamai/legal-document-classifier/blob/main/LICENSE), for both the code and the trained weights. The package has no runtime dependencies. The training data isn't distributed.

## Support

If this package saved you some time, consider [buying me a coffee](https://buymeacoffee.com/nadamai)! ☕
