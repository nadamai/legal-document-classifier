# Classifier

## What counts as a web legal document

The library classifies web pages, so a positive is a web legal document published on a website. Legal documents outside the web, such as property or vehicle sale contracts, are out of scope.

| Page                                                                                  | Label    |
| ------------------------------------------------------------------------------------- | -------- |
| a web legal document itself: terms of service, privacy policy, cookie policy, store rules | positive |
| a page about a legal topic that isn't itself a legal document                         | negative |
| a list of legal documents (mostly links to them)                                      | negative |
| an imprint, a statute or a contract template                                          | negative |
| an ordinary page (home, product, article, help, login)                                | negative |

The second and third rows are the most valuable negatives. They look like legal documents and are what the model must learn to reject.

## Public API

`src/index.ts` exports two functions, `predictWebLegalDocumentProbability` and [`configure`](#custom-weights), the constant `SUPPORTED_LANGUAGES` (`['en', 'pl']`, the bundled languages), and the types `SupportedLanguage`, `Configuration`, `WeightsSource` and `Weights`:

```ts
predictWebLegalDocumentProbability<L extends string = SupportedLanguage>(
	document: Document,
	language?: NoInfer<L> // defaults to 'en'
): Promise<number>
```

- It returns `p` from 0 to 1 for a rendered page. Internally it runs `extractPage(document)` ([extraction.md](extraction.md)), which reduces the page to a `Page` (`src/types/Page.ts`: `content`, `title`, `h1`, `h2`), then scores that. A page without text in any field returns `0`.
- It needs a rendered page in a browser, and never modifies it ([extraction.md](extraction.md#requirements)).
- `language` is optional and defaults to `en`. The caller decides how to determine it.
- `language` is typed `SupportedLanguage` (`en` or `pl`) by default. For a language with [custom weights](#custom-weights), name the allowed set as the type argument: `predictWebLegalDocumentProbability<SupportedLanguage | 'de'>(document, 'de')`, or `<string>` for any code. A language with neither bundled nor custom weights throws ([language handling](#language-handling)).
- It loads the weights for `language` on first use: the custom weights if there are any, else the bundled ones with a dynamic import ([weights format](#weights-format)).
- `extractPage`, the `Page` type and scoring an already extracted `Page` (`src/model/predictWebLegalDocumentFeaturesProbability.ts`) are internal. Callers always pass the document, so the model only ever sees text extracted exactly as its training data was.

### Example call flow (browser extension)

1. Detect the page's language with whatever the environment offers, for example Chromium's `chrome.tabs.detectLanguage` or `chrome.i18n.detectLanguage` on the page's text.
2. If the detection is reliable and the language has weights, bundled or custom, call `predictWebLegalDocumentProbability(document, language)`. The page is extracted once, inside that call. For an unsupported language, skip the page or choose a supported language yourself.

### Custom weights

`configure` (`src/configure.ts`) sets weights of the caller's own, globally, for every later `predictWebLegalDocumentProbability` call:

```ts
configure({
	weights: {
		de: 'https://cdn.example.com/legal-weights/de.json',
		en: new URL('./weights/en.json', import.meta.url),
		cs: { bias: -1, weights: { privacy: 2.1 } }
	}
});

await predictWebLegalDocumentProbability<SupportedLanguage | 'de'>(document, 'de');
```

- **Global and replaced as a whole.** The setting holds until the next `configure` call, which replaces the whole set. `configure({})` returns to the bundled weights only.
- **Sources:** each language maps to a `WeightsSource` (`src/types/Configuration.ts`):
  - a URL, as a string or `URL`, fetched with `fetch`. A relative string resolves against the document's base URL. A remote URL must allow cross-origin requests from where the code runs. Node's `fetch` doesn't read `file:` URLs, so in Node pass an object instead.
  - a `Weights` object in the [weights format](#weights-format). It's checked and copied inside `configure`, so later changes to it have no effect. An invalid one throws there, and the previous configuration stays.
- **Override and extend:** custom weights replace the bundled ones for their language, whose chunk is then never fetched, and can add languages without bundled weights.
- **Loading:** a URL is fetched on first use for its language, once even for concurrent calls, and cached until the next `configure`.
  - A network error or an HTTP error status throws `Failed to load weights for "<lang>" from <url>`, with the cause.
  - A response that isn't valid weights throws `Invalid weights for "<lang>" from <url>`.
  - A failed load is forgotten, so the next call fetches again. It never falls back to the bundled weights.
- **Validity check:** `bias` must be a finite number, and `weights` an object whose values are all finite numbers (`src/model/isWeights.ts`).
- **Same features:** custom weights must be trained with `npm run train` on the same feature code as the library version that uses them. After a version that changes the features, retrain them, or `p` comes out wrong without any error.

## Result semantics

- `p` is calibrated to the training data: `p = 0.95` means about 95 of 100 training-like pages with that score are legal documents. On pages unlike the training data it can be off, which is why the threshold is chosen from measured precision, not read off `p` ([training.md](training.md#evaluation)).
- A page without tokens in any field returns `0`. That includes a page made only of numbers, because numbers are dropped.
- A page whose tokens have no weights scores `sigmoid(bias)`, the model's baseline.
- There's no `null`. The only errors are for a language without weights, and for custom weights that fail to load or are invalid.
- The same page always gives the same result.

## Language handling

- The caller passes the language code and decides how to determine it. Without one, `predictWebLegalDocumentProbability` uses `en`.
- `language` is typed by the type parameter `L`, which defaults to `SupportedLanguage`, the codes with a bundled weights file (`en` and `pl`), derived from `SUPPORTED_LANGUAGES` in `src/model/supportedLanguages.ts`. Callers can check a detected code against `SUPPORTED_LANGUAGES` at runtime. `NoInfer<L>` stops TypeScript from widening `L` from the argument, so without a type argument a code from a detector (a `string`) or a custom language fails the type-check. Naming the set, such as `<SupportedLanguage | 'de'>` or `<string>`, allows more. Consumers need TypeScript 5.4 or later for `NoInfer`. A new bundled language needs its JSON file and its code added to `SUPPORTED_LANGUAGES`.
- Weights are picked by language in `src/model/loadWeights.ts`: custom weights first, else the bundled file. A language with neither (for example `jp`) throws `Unsupported language: "jp"`, with the failed import as its `cause`. It never falls back to another language's weights, or from custom weights to the bundled ones. There's no multilingual model.
- The weights are loaded before the page is scored, so a language without weights, or custom weights that fail to load, throw even on a page without text.
- Open: how language codes are normalised. Codes are matched exactly, so a code with a region (for example `en-GB`) isn't supported; the caller has to pass `en`.

## Model

- **Logistic regression** (`src/model/predictProbability.ts`): `p = sigmoid(bias + Σ weight × value)` over the text's tokens.
  - The bias is the intercept that scikit-learn learns along with the weights.
  - A token without a weight counts as 0.
  - Weights are read with `Object.hasOwn`, so tokens like `constructor` never pick up a value from `Object.prototype`.
  - The sigmoid (`src/model/sigmoid.ts`) is computed in a numerically stable form.
- **Why logistic regression:**
  - `p` is a calibrated probability.
  - On vocabulary-driven tasks like this one, linear models come close to the best models.
  - It's small and fast.
  - Its top weights read as a learned dictionary, so the model can be inspected.
  - It's deterministic.
- **Model types not used:**
  - hand-written dictionary: `p` is an invented number, and precision is too low
  - fastText-style models: need WebAssembly, and weigh 1–5 MB
  - small transformers: 30–120+ MB and 0.1–2 s per page
  - Chrome's Gemini Nano: seconds per page, Chrome 138+, uncalibrated
  - Naive Bayes: uncalibrated; useful only as a training baseline
- **No classifier library.** Scoring is a few lines of code, and the JavaScript libraries checked don't fit:
  - they use dense vectors or their own model formats, and can't load scikit-learn weights
  - many train in JavaScript, while training in Python offers far more mature ML tooling
  - Naive Bayes and small neural-network libraries give no calibrated probability, and the Naive Bayes model files are large
  - general ML runtimes add tens of KB to the bundle, as much as a language's weights, for a weighted sum
  - code generators that turn a trained model into source code don't scale to thousands of features
- **Budget:** under 10 ms per page and up to about 100 KB of weights per language. Scoring a 65,000-character page takes about 1.8 ms in Node, most of it tokenizing and building features. Extraction is measured separately ([extraction.md](extraction.md#performance)).

## Features

`src/features/` computes them. Training uses the same code, through `tools/featurize.ts`.

- **Tokens** (`src/features/tokenize.ts`):
  - **Words:** runs of Unicode letters (with their combining marks) and digits. Each word is NFKC-normalised and lowercased with `toLowerCase()`. Pure-ASCII words skip NFKC, which would leave them unchanged anyway.
  - **Legal symbols** are tokens of their own, even when attached to a number:
    - `§` section sign
    - `¶` paragraph sign
    - `№` numero sign, used in laws cited in Slavic languages
    - `©`, `®`, `™` copyright and trademark marks
    - `&` ampersand, as in "Terms & Conditions"

    Other symbols and punctuation are dropped.
  - **Numbers are dropped,** so they never get a weight. This covers words made only of digits (`1`, `2026`, `94043`), including full-width or superscript digits after NFKC.
    - Specific numbers are noise, such as list counters, years and postal codes, and a weight for them would only memorise the training pages.
    - Words that merely contain digits (`312g`, `mp3`) stay.
    - Single-character words (`a`, `i`, the `t` in "don’t") also stay. In some languages one character is a meaningful word: Chinese 法 (law) or 条 (article), and the Russian abbreviations п. and ч. in legal citations.
  - For example, `§2 sec. 3` becomes `§`, `sec`, and `§§ 4–6` becomes `§`, `§`.
  - Words are normalised one by one, after splitting, because NFKC on the whole text would turn `№` into "No" and `™` into "TM".
  - **Segments:** `tokenizeSegments` splits the tokens into runs. A run ends at a line break, a sentence end (`.`, `!`, `?`, `…`) or a dropped number, so word pairs never cross those points. "personal data. Data controller" gives the runs `personal data` and `data controller`, and "art. 5 sec. 2" gives `art` and `sec`, never a fake `art sec`.
- **Word pairs (bigrams):** besides every token, every pair of neighbouring tokens within a run becomes a feature, joined by a space: `privacy policy`, `terms of`, `of service`. A phrase says far more than its words apart.
  - Single tokens stay too, because signals like `terms` or `§` stand on their own.
  - Tokens never contain spaces, so a pair can't collide with a token.
  - Separate headings are separate lines, so the last word of one heading never pairs with the first word of the next.
  - Inflection splits phrases: `privacy policy` and `privacy policies` are different pairs.
  - Three-word phrases (trigrams) aren't used. Pairs already cover most of them (`terms of` + `of service`), and trigrams would multiply the weights again for little gain.
  - These operations give the same result in Node (training) and a browser (production). Locale-dependent APIs (`toLocaleLowerCase`, `Intl.Segmenter`) are avoided for that reason.
- **Fields** (`src/features/extractFeatures.ts`): the page's fields become three groups of features.

  | Group | Built from | Feature name | Example |
  | --- | --- | --- | --- |
  | content | `content` and `h2` | the token or pair itself | `rights`, `your rights` |
  | title | `title` | `title:` + token or pair | `title:privacy policy` |
  | h1 | `h1` (all of them together) | `h1:` + token or pair | `h1:privacy` |

  - **Title and `h1` get their own weights.** They name the whole document, so a word there is a stronger signal than the same word in the body.
  - **`h2` shares the content weights.** Its tokens are added to the content tokens. They're already part of `content`, so a section heading's words count twice there, which gives them a mild boost without weights of their own. With more data, an evaluation by domain can show whether separate `h2` weights would pay off.
  - Tokens never contain `:`, so the names can't collide.
  - `h3`–`h6` aren't used.
- **Values:** one feature per distinct token or pair in a group, with value 1 + ln(count), L2-normalised **within that group**. Neither text length nor a long body can shrink a short title's features.
- **Content cap:** only the first 30,000 characters of `content` count, cut at the last space or line break before that point. The start of a page is enough to identify a document, and the cap bounds the cost on very long pages. The title and headings aren't capped.
- Any change to the feature code changes the features, so the weights must be retrained.

## Weights format

- `src/weights/<lang>.json` is a JSON object with two fields. It's written by `training/train.py` (`npm run train`), and typed as `Weights` (`src/types/Weights.ts`). `src/weights/` holds only these files.
  - `bias`: the model's intercept.
  - `weights`: feature → weight. A feature is a content token (a word or a legal symbol such as `§`), a pair of tokens (`privacy policy`), or either of those with a field prefix (`title:privacy policy`, `h1:privacy`).

  ```json
  {
  	"bias": -1,
  	"weights": {
  		"privacy": 1.5,
  		"terms": 1.2,
  		"liability": 0.8
  	}
  }
  ```

- The example above shows the shape. The real files hold the 2,000 strongest weights, rounded to 4 significant digits: `en.json` is about 45 KB and `pl.json` about 47 KB ([training.md](training.md#pipeline)).
- `bias` is required. A file without it makes `p` come out as `NaN`.
- `src/model/loadWeights.ts` loads ``import(`../weights/${language}.json`)``. The build turns that into one chunk per weights file, fetched the first time it's needed ([architecture.md](architecture.md#toolchain)).
- **Adding a bundled language means adding its JSON file and its code to `SUPPORTED_LANGUAGES`.** No other code changes, and a unit test fails if the two don't match. A language without a file needs [custom weights](#custom-weights), or it throws ([language handling](#language-handling)).
- The bundled JSON's shape isn't type-checked, because an import with a variable path is typed as `any`. Custom weights are checked at runtime instead.
- Only non-zero weights are listed.
- Weights are sorted by value, highest first: the top of the file shows what marks a legal document, and the bottom what marks a standard page. The classifier looks weights up by name, so the order doesn't affect `p`.

## Threshold

- The library returns `p` only, with no yes/no answer and no built-in threshold. Each caller decides where to cut, for its own trade-off between catching more documents and flagging fewer wrong pages.
- `npm run evaluate` is the guide: it prints precision and recall at several thresholds on held-out sites, and the lowest threshold with at least 99% precision ([training.md](training.md#evaluation)).
- The right threshold differs per language and moves with every retrain, because each language has its own weights. Check it again after retraining.
- Precision comes first because a caller acts on a positive, while a miss only means nothing happens.
- Open: whether a recommended threshold ships in the weights file or only in the README.
