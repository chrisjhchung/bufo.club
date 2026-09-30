# Semantic search — deferred design note

**Status:** parked, not started. Written down so the reasoning survives.

## The problem

Someone knows what they want but not what it is called. They ask for
`:bufo-uses-knife-to-prod-gently:`; the library has
`:bufo-weilds-pointy-object:`. Visually the same, textually unrelated, so
keyword search returns nothing and 1,646 bufos are too many to browse.

## Why the obvious approach fails

The tempting first move is to have an LLM write a description of each bufo from
its name. It does not work here: a description generated from
`bufo-weilds-pointy-object` can only paraphrase that name, so it inherits
exactly the vocabulary gap we are trying to cross. "Knife" never appears,
because the slug never said "knife".

The only source of truth about what a bufo depicts is its image.

## The design

1. **Caption from the image, not the name.** Run every bufo's PNG through a
   vision model: what is depicted, the expression, and the situations it suits.
   This is the step that makes the rest work.
2. **Store captions and richer tags in D1.** This alone improves the existing
   keyword search, and doubles as real alt text — today `alt` is just the title,
   which helps neither screen readers nor image search.
3. **Embed captions offline.** 384-dim, quantised to int8: about 630KB for the
   whole library, lazy-loaded as a static file beside the manifest so ordinary
   browsing is untouched.
4. **Embed the query at search time** via Workers AI, cosine similarity in the
   browser, **hybrid-ranked** with the existing keyword score so an exact name
   still wins. Pure vector search is worse than what we have for exact lookups.

## Validate before committing

Caption 50 bufos first, deliberately including awkward ones like
`bufo-weilds-pointy-object`, and read the output next to the slugs. These are
small (128px), stylised images and vision models vary a lot on that. If the
captions are vague, we have spent pennies instead of a full batch.

## Open questions

- **Which model.** Workers AI is free-ish and the existing token reaches it, but
  a 1,646-image batch spreads over several days of the daily allowance. A paid
  API finishes in one pass for a few dollars and likely captions better.
- **Animated bufos.** Roughly a quarter of the library is GIF, and vision models
  want a still frame. Either extract the first frame (needs a small GIF decoder
  — no library available in this toolchain) or caption PNGs first and handle
  GIFs in a second pass.

## What it costs us

Search is currently zero Worker requests: the manifest is static and matching
happens in the browser. Semantic mode makes each search one Worker request plus
one Workers AI call. Debounced and mode-gated that is a few thousand a day
against a 100k budget — affordable, but it is a deliberate break with the rule
the rest of the site is built on, so it should stay behind an explicit toggle.
