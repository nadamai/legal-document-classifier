# Training

Python fits the weights. Turning text into features is TypeScript ([architecture.md](architecture.md#typescript-and-python-boundary)).

## Tooling

- **Python** in a virtual environment at `training/.venv` (gitignored), with pinned `scikit-learn`, `numpy`, `playwright`, `protego`, `publicsuffixlist` and `pytest` from `training/requirements.txt`. `npm run train:setup` (`training/setup.sh`) creates it, and then downloads Playwright's own Chromium build (`playwright install chromium`).
  - **Python 3.12 or newer,** because numpy 2.5 needs it. `train:setup` takes the first that's new enough of:
    1. `$PYTHON`, if set: `PYTHON=/path/to/python3 npm run train:setup`
    2. the global `python3`
    3. the newest `python3.X` on `PATH`. macOS's own `python3` is 3.9, so there it finds Homebrew's (`brew install python`).

    With none of them new enough, it stops and says how to install one.
  - Pinned: `numpy==2.5.4`, `scikit-learn==1.9.1`, `playwright==1.64.1`, `protego==0.7.0` (the `robots.txt` parser) `publicsuffixlist==1.1.2.20261109` (what counts as one site) and `pytest==9.2.0` (`npm run test:training`, [testing.md](testing.md#training-tests)). The last one's version is the date of its bundled list, so updating it can change which pages count as one site. They're tested with Python 3.14. A Python released after a pinned package may have no prebuilt wheel for it yet, so pip would try to build it from source. Point `PYTHON` at an older one then.
  - An existing `training/.venv` is reused. To switch Python, delete it and run `npm run train:setup` again.
  - VS Code: `.vscode/settings.json` points the Python extension at `training/.venv/bin/python`, so Pylance resolves `sklearn`. If imports are still underlined, run "Python: Select Interpreter" once and pick that path. VS Code remembers an earlier choice over the default.
- **tsx** runs `tools/featurize.ts` straight from source ([architecture.md](architecture.md#toolchain)).
- Training data lives in `training/data/`, which is gitignored and never committed: the [URL lists](#url-lists) in `urls/` and the [page texts](#page-texts) in `contents/`.

## Page texts

`training/data/contents/<lang>/legal.csv` and `not-legal.csv` hold the text of each page. The file name is the label.

- Semicolon-separated, UTF-8, with the header `url;title;h1;h2;content`.
- A page's text can exceed the 128 KiB field limit of Python's `csv` module, so `training/common.py` raises it. Code that reads these files elsewhere must raise it too.
- **Columns:**
  - `title`: the page's `<title>`.
  - `h1`, `h2`: the text of the page's headings of that level, one heading per line. `h3`–`h6` aren't collected.
  - `content`: the page's whole main text. It still contains the headings, because `extractPage` keeps them in production too.
- Every field holds plain text, never HTML. Tags such as `<div …>` must not appear, and entities such as `&amp;` must be decoded.
- Fields are quoted with `"` when they span several lines or contain `;`. A `"` inside a field is doubled.
- Write these files with a CSV library, never by pasting text in: a semicolon or a quote in the text would otherwise break the row.
- `npm run scrape` fills these files from `extractPage`, whose output has exactly these fields ([scraping](#scraping)). Never edit or add rows by hand: the model must learn from the same text production extracts.
- `train.py` reads every column. It trims the title, and splits each heading column into a list of lines (trimmed, with empty lines dropped). Missing heading columns count as empty, so a CSV with only `url;content` still trains.

## URL lists

`training/data/urls/<lang>/legal.txt` and `not-legal.txt` hold the labelled URLs, one per line. The file name is the label, and the folder is the expected language. They come from a private ratings database, so they're never published ([data-and-licensing.md](data-and-licensing.md)).

**The URL lists decide the labels.** Training uses a row of `contents/<lang>/<label>.csv` only while its URL is in that label's list. To relabel a page, move its line to the other list and run `npm run scrape`, which fetches it again under the new label. Its old row is then ignored, and training says how many rows it ignored.

## Scraping

`npm run scrape [-- <lang> …]` builds the package, then runs `training/scrape.py` for each language given (default `en`). `npm run scrape:all` (`training/scrape_all.py`) scrapes every language that has a folder in `training/data/urls/`. Language codes, failures and the exit code work as in training ([pipeline](#pipeline)).

For each language:

1. Read `training/data/urls/<lang>/legal.txt` and `not-legal.txt`: one URL per line, blank lines ignored. A URL without a scheme (`example.com/terms`) gets `https://`, and repeated URLs are read once. A missing file fails the language.
2. Leave out URLs already in `training/data/contents/<lang>/<label>.csv`, so a stopped run continues where it ended. Skipped URLs get another try on the next run. Delete the CSVs to scrape from scratch, for example after a change to `src/extraction/`.
3. Spread each site's URLs apart, so parallel pages rarely load one site at once.
4. Check the site's `robots.txt` before loading the page, and again for the final site after a redirect to another one ([data-and-licensing.md](data-and-licensing.md#scraping)).
   - Each origin's `robots.txt` is fetched once per run and parsed with Protego, which supports `*` and `$` wildcards and lets the most specific rule win. Python's `urllib.robotparser` does neither.
   - The page is skipped if the rules disallow it for the scraper's own token (`LegalDocumentClassifier`, which falls back to `*`) or for any common AI-training crawler: `GPTBot`, `ClaudeBot`, `anthropic-ai`, `Google-Extended`, `Applebot-Extended`, `CCBot`, `meta-externalagent`. Blocking those is how most sites opt out of AI training.
   - As in RFC 9309, a missing `robots.txt` (4xx) allows everything. An unreachable one (5xx, 429, a network error) skips the whole site for that run.
5. Load each URL in headless Chromium, 4 pages at a time, with a 1920×1080 viewport and the browser locale set to the language. The user agent says `Chrome` instead of `HeadlessChrome`, which many sites turn away outright.
6. Wait for the DOM (up to 30 s), then for the network to go quiet (up to 10 s), then 2 s more, so client-side rendering, lazy sections and late banners settle.
7. Skip the page when:
   - it reserves text and data mining, with a `tdm-reservation: 1` header or `<meta name="tdm-reservation" content="1">` (TDMRep)
   - loading fails: DNS, TLS, a timeout, or a download such as a PDF
   - the status is 400 or above, or the content type isn't HTML
   - it redirected to the site's home page, or to a URL that mentions consent, login, sign-in or captcha, or Google's `/sorry/` page. A dead link that lands there would otherwise be saved under the original URL's label.
   - it's a block page from Cloudflare, HUMAN (PerimeterX) or DataDome
   - it has fewer than 200 characters of text
   - it has at most 1,500 characters and a captcha widget, or a robot-check or not-found phrase in its title or text ("Just a moment", "Verify you are human", "404", "Page not found"…). Longer pages keep those words, because a privacy policy may well mention reCAPTCHA.
8. Run `dist/extractor.iife.js` in an isolated world, so the page's own scripts can't change the result ([extraction.md](extraction.md#using-it-from-python-playwright)). The robot-check and TDMRep checks run there too. A result that isn't a page of plain strings skips the page. Then append the row to the CSV right away, one heading per line. `url` is the listed URL with its scheme, even after a redirect.

If one page hits an unexpected error, the run stops: the other workers are cancelled, and rows already written stay. Running again continues where it ended.

It prints one line per page, `ok` with the text length or `skip` with the reason, and the counts for each file.

## Pipeline

1. **Scrape** (`npm run scrape [-- <lang> …]`): fill the [page texts](#page-texts) from the [URL lists](#url-lists) ([scraping](#scraping)).
2. **Train** (`npm run train [-- [options] <lang> …]`, which runs `training/train.py`). It trains every language given, for example `npm run train -- en pl`, or only `en` when none is given. Repeated codes train once. Codes must look like `en` or `pt-BR`, because they become file paths. The options are `--min-sites`, `--max-weights` and `--c`, described below and in `--help`. A failing language (missing CSVs, too few pages) is reported and the others still train, but the command then exits with an error.

   `npm run train:all [-- options]` (`training/train_all.py`) trains every language that has a folder in `training/data/contents/`, in alphabetical order. It skips folders whose names aren't language codes. Language codes, the per-language loop, the CSV format and what counts as a site live in `training/common.py`, which the scraper shares.

   For each language:
   1. Read `training/data/contents/<lang>/legal.csv` (label 1) and `not-legal.csv` (label 0) with Python's `csv` module, keeping only rows whose URL is in the matching [URL list](#url-lists).
   2. Get the features from `tools/featurize.ts`. `train.py` pipes the pages to it as JSON lines on stdin, one per line: `{ "content": …, "title": …, "h1": […], "h2": […] }`. These are the fields of the `Page` type (`src/types/Page.ts`). It reads one JSON line of `{ feature: value }` per page from stdout. Python never computes a feature.
   3. Skip pages without tokens. The classifier returns 0 for them, so they can't teach it anything.
   4. Drop every feature found on fewer than `--min-sites` sites (default 5, and 1 keeps every feature).
      - A site is the registrable domain, from the Public Suffix List (`publicsuffixlist`, whose pinned version fixes the list): `policies.google.com` and `support.google.com` are one site, while each `*.co.uk` or `*.github.io` name is a site of its own.
      - Counting sites rather than pages matters: one site's boilerplate repeats on all its pages. A feature on fewer sites is a brand, a person's name from a sole trader's terms, or one site's footer. None of those may reach the published weights, and they don't generalise anyway.
      - Only columns are removed, so the remaining values are still exactly what `tools/featurize.ts` computed, and what production computes: production normalises over all of a page's features too, and looks up only those with a weight. The "no features in Python" rule holds.
      - It prints how many features remain. If none do, the language fails with a hint to add sites or lower `--min-sites`.
   5. Fit scikit-learn's `LogisticRegression` (L2 penalty, `lbfgs`, `C = 1.0`, `max_iter = 1000`) on the features, vectorised with `DictVectorizer`. `--c` changes `C`: lower means smaller weights.
   6. Keep the `--max-weights` strongest weights (default 2,000, by absolute value), and fit again on only those features, so their weights and the bias make up for the dropped ones. The other features get no weight, which production treats as 0.
   7. Round the weights to 4 significant digits. They're rounded in the fitted model itself, so every `p` that training and evaluation report is exactly the `p` the published file gives.
   8. Write `src/weights/<lang>.json`: the intercept as `bias`, plus every non-zero weight, indented with tabs. Weights are sorted by value, highest first: the strongest legal signals open the list and the strongest non-legal signals close it. Ties are broken by token, so the file stays byte-identical between runs.
   9. Print a report: how many features each step kept, page counts, the file size, the median `p` of each label on the training pages, and the strongest tokens in each direction. `npm run evaluate` measures how it does on unseen sites ([evaluation](#evaluation)).

The same page texts always give a byte-identical weights file. On every training page, the TypeScript classifier with the published file reproduces the `p` training reports, within 1e-15.

**Why these defaults** (measured with `npm run evaluate` on the current data):
- **2,000 weights** make files of about 45–47 KB, within the budget of up to about 100 KB. Keeping every weight (54,000 for English, 127,000 for Polish, 1.2–3.1 MB) changed AUC by at most 0.003, and 3,000 weights (about 70 KB) did no better than 2,000.
- **`C = 1`** gave the best AUC and the most recall at 99% precision of the values 0.1, 0.3, 1, 3, 10 and 30. Higher values raise recall at p ≥ 0.9 but let more not-legal pages through.
- Check both again with `npm run evaluate -- --max-weights N --c C` when the data changes a lot.

### Language detection

The scraper doesn't detect a page's language. Each page is filed under its URL list's language.

## Evaluation

`npm run evaluate [-- [options] <lang> …]` (`training/evaluate.py`) measures each given language, or every language in `training/data/contents/` when none is given. It takes the same options as training.

- **Held out by site:** the sites are split into 5 groups. Each group's pages are scored by a model fitted on the other four, with exactly the training steps above. No page is scored by a model that saw its site, so a site's boilerplate can't inflate the result.
- **Report:** AUC, precision and recall at p ≥ 0.5, 0.7, 0.8, 0.9, 0.95 and 0.99 with the number of not-legal pages above each, and the lowest threshold whose precision is at least 99% (assumption 5). The library ships no threshold, so this is what callers choose theirs from ([classifier.md](classifier.md#threshold)).
- **Review list:** `training/data/review/<lang>.csv` (`url;label;p;title`) holds every page with its held-out `p`, the pages that disagree most with their label first. It prints the top 3 in each direction: not-legal pages with a high `p` and legal pages with a low one. Fix a label by moving the URL between the [URL lists](#url-lists).

Open:
- **Baselines** to compare against:
  - a hand-written dictionary scorer
  - Naive Bayes (its probabilities bunch up near 0 and 1, so it's useful only as a baseline)
  - published reference: a random-forest classifier with 98% precision and 93% recall on English privacy policies (arXiv 2008.09159)

## Retraining

- New weights change results without any code change.
- Any change to the feature code requires retraining, custom weights included. The feature snapshot test fails until it's updated ([testing.md](testing.md#feature-snapshot)).
- After retraining, run `npm test`: the bundled weights must still pass its sanity bounds.
- Open: how retrained weights are versioned, that is, which semver bump a retrain gets.
