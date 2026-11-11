# Data and licensing

## Licenses

- **Code and weights:** MIT.
  - MIT is the npm default and blocks nobody.
  - It keeps outside contributions usable in closed-source products. Under GPL or LGPL they couldn't be used there without asking each contributor.
- **Training data** (`training/data/`): private and gitignored, so it's neither published nor licensed.
- A license only covers what the project owns. Third-party page text is never under these licenses.

## What may be published

Published:

- the scraper and the training code
- the trained weights
- summary counts (pages per language and label, number of sites) and benchmark results

Never publish:

- anything under `training/data/`: the URL lists, their labels and the page texts
- the text or HTML of non-documents (news, blogs, shop pages)

The weights can still hint at the URL lists: a word found on only one site, such as a brand in page titles, may get a weight of its own. Training prevents that by dropping every feature found on fewer than 5 sites (`--min-sites`), which also drops personal names from sole traders' terms ([training.md](training.md#pipeline)).

### Why the text isn't published

- Copyright applies whether or not a page is public. Being public only means anyone may read it.
- Many policies are written by lawyers or come from commercial templates whose authors are likely to object.
- The EU text-and-data-mining exception covers copying for training, not making the copies public.
- Non-documents are clearly copyrighted, and the model cannot be trained without them.
- A sole trader's terms contain personal data (name, address, tax ID, phone). Republishing them would make the project a data controller under GDPR.

### Test fixtures

The same rules apply to `test/common/fixtures/` and every test: use hand-written pages, or content the project may redistribute. Never commit copies of third-party pages.

## Scraping

Copying pages to train a model relies on the EU text-and-data-mining exception (Article 4 of Directive 2019/790). Outside scientific research, it only applies where the site hasn't reserved its rights in a machine-readable way. So the scraper skips a page when:

- its `robots.txt` disallows it for the scraper or for a common AI-training crawler (`GPTBot`, `CCBot`, `Google-Extended`…). Most sites opt out of AI training that way.
- it sends a TDMRep reservation: a `tdm-reservation: 1` header or meta tag.

The rules and their details are in [training.md](training.md#scraping). The exception also allows keeping the copies only as long as training needs them, which is one more reason `training/data/` stays private.
