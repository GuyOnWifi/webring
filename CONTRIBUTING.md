# Contributing

## Joining the ring

See [How to join](README.md#how-to-join-2-minutes). Adding yourself is a one-file PR
(`members/<your-github-username>.json`) that the bot verifies and merges after a short
review window. No maintainer needed.

## Changing the code

The ring is built to run itself, so code changes are rare. If you have a fix or an
improvement:

- Open a PR. Anything beyond adding your own `members/*.json` is **not** auto-merged; a
  human reviews it.
- Keep it dependency-light and static-export friendly (the site is a GitHub Pages static
  export, no server).
- `npm run typecheck` and `npm run lint` should pass; `npm run validate` checks member
  files and `npm run scrape` rebuilds the index locally.

## Forking it for your own ring

See [Run your own ring](README.md#run-your-own-ring-fork-it). Pick your own ring
namespace; don't reuse `uwcs`.
