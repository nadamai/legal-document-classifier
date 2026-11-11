# Main-content extraction

`extractPage(document): Page` (`src/extraction/`) turns a rendered web page into what the classifier reads: `{ content, title, h1, h2 }`. It's internal to the package: `predictWebLegalDocumentProbability(document)` calls it before scoring.

## One extractor for production and training

- In production, `predictWebLegalDocumentProbability` runs it on the caller's `document`.
- The training scraper (`training/scrape.py`) injects `dist/extractor.iife.js` into each page with Playwright. `npm run build` builds that file from the same source, and it exposes `LegalDocumentExtractor.extractPage(document)`.
- Never train on text from any other extractor (a Python port, a backend's text dump, text pasted by hand). The model would learn from different text than it sees in production.
- Any change here changes the features, so the weights must be retrained.

## Requirements

- **A rendered page in a real browser.** Extraction uses computed styles, `innerText` and `checkVisibility()`. On a document without a window (from `DOMParser`), fixed and sticky elements aren't detected and hidden text is included.
- **It never modifies the page.** It only reads it.

## How it works

1. **Root:** the page's `<main>` (or `[role="main"]`), if there's exactly one and it holds at least 25% of the body's text. Otherwise `<body>`. Text length here is `textContent` minus scripts and styles, which needs no layout.
2. **Excluded elements** under the root:
   - `nav`, `aside`, `dialog` and the ARIA roles `banner`, `navigation`, `contentinfo`, `complementary`, `dialog`, `alertdialog`, plus `[aria-modal="true"]`.
   - `header` and `footer`, unless they sit inside `article`, `aside`, `main`, `nav` or `section`. Inside those they belong to the content, for example an article's own heading block or a section's footnote.
   - The containers of common consent tools: OneTrust, Cookiebot, Didomi, Usercentrics, Quantcast, CookieYes, Cookie Law Info, iubenda, Borlabs, Complianz, TrustArc, Moove, Osano, Cookie Consent (`.cc-window`) and Klaro (`src/extraction/selectors.ts`). Cookie banners are the largest source of false positives: on many sites the consent text ("The controller of your personal data is…") reads like a privacy policy.
   - Elements whose id or class names a consent banner (`cookie-banner`, `consent-bar`, `gdpr-popup`, `cookies-modal`…), if they hold at most half of the root's text. The pattern names banners, not cookie content, so a cookie policy's own `cookie-table` stays.
   - `position: fixed` or `sticky` containers, if they hold at most half of the root's text. Some sites scroll all their content inside one fixed container, and that container must stay. Only `div`, `section`, `aside`, `header`, `footer`, `nav`, `form`, `dialog` and custom elements are checked, because overlays are containers and computed styles are the main cost ([performance](#performance)).
   - Ligature icon fonts (`material-icons…`, `material-symbols…`). Their icon names are real text, such as `subject_black`.
3. **Text:** a subtree without excluded elements contributes its whole `innerText`. Only the elements on the way to an excluded element are walked node by node. Script, style, noscript, template and SVG elements, and anything not rendered (`checkVisibility()`), are skipped. Hidden elements need that check because the `innerText` of a `display: none` element returns its raw text.
4. **Headings:** the `h1` and `h2` elements inside the root that aren't excluded and are rendered, one entry per heading.
5. **Title:** `document.title`.
6. **Normalising:** whitespace inside a line collapses to single spaces, private-use characters (icon-font glyphs) are removed, and empty lines are dropped. Line breaks stay, because word pairs never cross them.

`innerText` applies CSS `text-transform`, so headings styled in capitals come out in `UPPERCASE`. That's harmless, since the tokenizer lowercases everything.

Deliberately **not** excluded: `[aria-hidden="true"]`. Many sites set it on the whole page while a dialog is open, which would wipe out all the content.

## Using it from Python (Playwright)

Run the script's source in an **isolated world** through Chrome's DevTools protocol, as `evaluate_isolated` in `training/scrape.py` does:

```python
script = Path('dist/extractor.iife.js').read_text()
expression = (
    '(() => { ' + script
    + '\nreturn LegalDocumentExtractor.extractPage(document); })()'
)
cdp = await page.context.new_cdp_session(page)
tree = await cdp.send('Page.getFrameTree')
world = await cdp.send('Page.createIsolatedWorld',
                       {'frameId': tree['frameTree']['frame']['id']})
result = await cdp.send('Runtime.evaluate', {
    'expression': expression,
    'contextId': world['executionContextId'],
    'returnByValue': True,
})
data = result['result']['value']
# data = {'content': …, 'title': …, 'h1': […], 'h2': […]}
```

- **Why an isolated world:** it shares the page's DOM but has its own JavaScript built-ins. `page.evaluate` runs in the page's own world instead, where the page's scripts can replace built-ins. A page whose `String.prototype.trim` returns a `String` object, as some old polyfills do, would turn every heading into a dict on the Python side.
- **Why not `page.add_script_tag`:** sites with a strict Content Security Policy (Trusted Types, as on Google's pages) block it. The DevTools protocol isn't subject to those policies.

Write the result to the page CSVs with a CSV library, one heading per line ([training.md](training.md#page-texts)).

## Performance

Extraction runs inside every `predictWebLegalDocumentProbability` call and must fit the 10 ms budget on large pages too, so it avoids work per element and anything that forces a layout:

- Computed styles are read only for containers. Reading them for every element cost 9–10 ms on a long Wikipedia article, against under 1 ms for containers only, with no overlay missed on the pages checked.
- Text shares, used to pick the root and to check overlays, use `textContent` minus scripts and styles, not `innerText`, which would force a layout.
- The final text needs `innerText`, so it's read with one call per subtree without excluded elements. Only the path to an excluded element is walked node by node.
- The tree walker skips excluded subtrees instead of visiting them.

Timed inside the page in Chrome 157 through Playwright:

- **A long Wikipedia article:** 16 ms on the first call after load, 5.9 ms on later calls.
- **Google's privacy policy:** 7.9 ms on the first call, 2.2 ms later.
- **Small pages:** 4–6 ms on the first call.

The first call pays for the page's style and layout, which `innerText` and `checkVisibility()` force if the browser hasn't done them yet. That's why small pages don't get much below 4 ms.
