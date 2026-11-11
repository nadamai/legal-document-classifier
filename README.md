# Web Legal Document Classifier ⚖️

[![npm version](https://img.shields.io/npm/v/@hamurabi/legal-document-classifier)](https://www.npmjs.com/package/@hamurabi/legal-document-classifier)
[![license](https://img.shields.io/npm/l/@hamurabi/legal-document-classifier)](./LICENSE)
[![CI](https://github.com/nadamai/legal-document-classifier/actions/workflows/ci.yml/badge.svg)](https://github.com/nadamai/legal-document-classifier/actions/workflows/ci.yml)

A zero-dependency npm package that tells whether a DOM document is a web legal document, such as a website's terms of service, privacy policy, cookie policy or store rules, right in the browser. No server, WebAssembly or runtime dependencies.

While it may also give high scores to other legal texts, such as property or vehicle sale contracts, it's meant for web legal documents only.

## How it works

Give it a rendered page's `document`, and it returns the probability `p` in `[0, 1]` that the page is a web legal document. It reads the page's title and main content, leaving out navigation, footers, overlays and cookie banners, and scores it with a small per-language logistic regression model. The language-specific weights are lazily loaded only when being used for the first time.

## Installation

```bash
npm install @hamurabi/legal-document-classifier
```

## Examples

### Scoring a document

```ts
import { predictWebLegalDocumentProbability } from '@hamurabi/legal-document-classifier';

const p = await predictWebLegalDocumentProbability(document);

if (p >= 0.9) {
    // Most likely a web legal document
}
```

The content extraction relies on the layout and computed styles, so it reads the page the way a visitor sees it, skipping hidden text and fixed overlays such as cookie banners. The page is never modified.

### Scoring a non-English document

```ts
import { predictWebLegalDocumentProbability } from '@hamurabi/legal-document-classifier';

const p = await predictWebLegalDocumentProbability(document, 'pl');

if (p >= 0.9) {
    // Most likely a Polish web legal document
}
```

To score non-English documents provide a lowercase two-letter ISO 639-1 language code. You can also introduce your own [custom languages](#custom-languages-and-weights).

Since there're many possible methods of establishing the page's language, it's left to the developer's choice. 

To see the list of all available languages please refer to: [Supported languages](#supported-languages).

### Custom languages and weights

```ts
import { configure, predictWebLegalDocumentProbability } from '@hamurabi/legal-document-classifier';

configure({
    weights: {
        fr: '/weights/fr.json',
        de: 'https://example.com/weights/de.json',
        pl: { 
            bias: -1, 
            weights: { 
                'polityka': 1.4, 
                'polityka prywatności': 2.1 
            } 
        }
    }
});

const p = await predictWebLegalDocumentProbability<string>(document, 'de');
```

If the desired language is not supported or you'd prefer to use a different set of weights, you can train your own (see: [Training](#training)) and configure the library to use them later for every call. It can be done by either providing a relative/absolute URL to the JSON file or passing an object directly.

### Using without a bundler

The package is a standard ES module, so `<script type="module">` can load it with no build step. Copy the whole `dist/` folder, because the weights chunks are loaded from next to `index.js`:

```html
<script type="module">
    import { predictWebLegalDocumentProbability } from './vendor/legal-document-classifier/dist/index.js';

    const p = await predictWebLegalDocumentProbability(document);
</script>
```

## Documentation

### `predictWebLegalDocumentProbability`

```ts
async predictWebLegalDocumentProbability<Language extends string = SupportedLanguage>(
    document: Document,
    language?: Language
): Promise<number>
```

Scores a rendered page as a web legal document. Doesn't modify the page.

| Argument   | Type       | Default | Description                                                                  |
| ---------- | ---------- | ------- | ---------------------------------------------------------------------------- |
| `document` | `Document` | `-`     | A document object rendered in a browser                                      |
| `language` | `Language` | `'en'`  | ISO 639-1 code. Set `Language` to allow languages beyond `SupportedLanguage` |

**Returns:** probability in `[0, 1]`. The same page always gives the same result.

**Throws:** for a language without bundled or custom weights, and when custom weights fail to load or are invalid.

### `configure`

```ts
configure(configuration: Configuration): void
```

Sets custom weights per language, globally, for every later prediction.

| Argument                | Type                            | Description                                                |
| ----------------------- | ------------------------------- | ---------------------------------------------------------- |
| `configuration.weights` | `Record<string, WeightsSource>` | A map of language codes and weight URLs or weights object  |

**Throws:** for an invalid weights object.

### Types

```ts
type Weights = { 
    bias: number; 
    weights: Record<string, number> 
};

type WeightsSource = string | URL | Weights;
```

## Training

You can train weights for a new language, or retrain a bundled one on your own data. The weights are fitted in Python, while the features are computed by the package's own TypeScript code, so a model sees exactly what it'll see in production.

### Requirements

- Node.js with the repository cloned and `npm install` run
- Python 3.12 or later

```bash
npm run train:setup
```

It creates a virtual environment in `training/.venv`, installs the pinned Python packages and downloads Playwright's Chromium for scraping. To use a specific Python version, run:
```bash
PYTHON=/path/to/python3 npm run train:setup
```

### 1. List the URLs

Create two files for your language in `training/data/urls/<language>/`, with one URL per line:

```
training/data/urls/<language>/
├── legal.txt        # pages that are web legal documents
└── not-legal.txt    # every other page
```

For the best results:

- Fill `legal.txt` with URLs from many different sites. Features found on fewer than 5 sites are dropped, so a single site's boilerplate never makes it into the weights.
- Fill `not-legal.txt` with pages that are easy to confuse with legal documents: lists of legal documents, help articles, blog posts about privacy, imprints, statutes and contract templates. Ordinary pages, such as home, product or login pages, are worth adding too.

### 2. Scrape the pages

```bash
npm run scrape -- <language>
```

It builds the package, then opens each URL in headless Chromium and saves the page's text to `training/data/contents/<language>/legal.csv` and `not-legal.csv`, with the same `extractPage` the library runs in the browser. Pages already scraped are skipped, so a stopped run continues where it ended.

The scraper respects the site owner's opt-out: it skips every page that `robots.txt` disallows for it or for common AI-training crawlers, and every page with a TDMRep `tdm-reservation`. It also skips failed loads, error pages, bot checks and redirects to a home or login page.

### 3. Train the weights

```bash
npm run train -- <language>
```

It writes `src/weights/<language>.json` and prints a report: the features kept at each step, the page counts, the file size and the strongest tokens in both directions. The same data always gives the same file, byte for byte.

| Option          | Default | Description                                                  |
| --------------- | ------- | ------------------------------------------------------------ |
| `--min-sites`   | `5`     | Keeps only the features found on at least this many domains  |
| `--max-weights` | `2000`  | Keeps only this many strongest weights (about 45 KB of JSON) |
| `--c`           | `1.0`   | Inverse regularisation strength: lower means smaller weights |

### 4. Evaluate and choose a threshold

```bash
npm run evaluate -- <language>
```

It splits the sites into 5 groups and scores each group with a model trained on the other four, so no page is scored by a model that saw its site. It prints the AUC, the precision and recall at several thresholds, and the lowest threshold with at least 99% precision.

It also writes `training/data/review/<language>.csv` with every page sorted by how much it disagrees with its label, the quickest way to find mislabelled URLs.

### 5. Use the weights

Use the results in the [`configure`](#custom-languages-and-weights) method.

Weights depend on the exact features of the package version that trained them, so retrain them when you update to a version that changes the tokenizer, the features or the extraction method.

## Supported languages

| Language   | Code | AUC   | 99% precision from |
| ---------- | ---- | ----- | ------------------ |
| 🇺🇸 English | `en` | 0.929 | `p ≥ 0.912`        |
| 🇵🇱 Polish  | `pl` | 0.973 | `p ≥ 0.860`        |

## Scope

The package is built to detect web legal documents. With custom weights you can train it to detect other kinds of pages, but keep in mind the tokenizer, features and extraction are tuned for legal text, and changes to them will always favour that purpose.

## Used by the Hamurabi Chrome extension

This package is developed and maintained as part of the [Hamurabi](https://hamurabi.app) project. It's used in the [Hamurabi Chrome extension](https://chromewebstore.google.com/detail/hamurabi/mhefkopgknnhkjonngnknkcfhfmallhh), where it decides when to show the rating of a web legal document. Feel welcome to check the extension out!

## License

Licensed under the [MIT](https://github.com/nadamai/legal-document-classifier/blob/main/LICENSE), for both the code and the trained weights. The package has no runtime dependencies. The training data isn't distributed.
