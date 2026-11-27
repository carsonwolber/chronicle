# chroniclr — current product decisions

These are the implementation choices in the current prototype and the next decision points. Each can change through a focused pull request.

## Identity and visual direction

The product name is **chroniclr**. The game screen is the primary screen: a large timeline board, tactile event cards, a restrained ink-and-brass palette, and a lightly textured background. The old marketing-style hero copy and the archive pitch are removed. Unlimited play stays as a single control.

## Random-window mode

At the start of each fixed eight-hour UTC edition, a deterministic random seed selects a base year uniformly from 15 through 2016. That year's Wikipedia article and the 14 neighboring annual articles supply event candidates. The game selects one entry from each of five distinct years within the window, shuffles the five, and awards one point for each event in its correct position.

The same edition and base year are shared between players. Each browser gets three rounds; the event selection changes between rounds. A countdown shows time until the next edition, when the base year and free-round counter roll over.

The event source uses the annual article's Events section rather than sampling raw category membership. Year categories can contain broad topic pages, institutions, and other pages that are not individual event clues. The annual event lists provide dated entries directly. If the API is unavailable or the selected window has too few entries, the prototype falls back to the curated local bank and uses a feasible window from that bank.

## Themed mode

The six curated timelines in `data/puzzles.js` are available in a separate mode. Each set has five events with unique years and a maximum 15-year spread. This keeps the authored themed experience available without making it the default.

## Name an event mode

The player sees a target year from 15 through 2016, searches Wikipedia, and chooses an article. chroniclr resolves its linked Wikidata item and looks for a point-in-time date, inception, start date, publication date, or end date. Score is `max(0, 1000 − |event year − target year|)`. Results without a supported date are rejected. A future review should decide whether the date-property order and the one-point-per-year curve feel fair across different kinds of historical events.

## Prototype boundaries

- The question bank is static and client-visible.
- Random-window requests go from the browser to Wikipedia; there is no proxy or editorial cache yet.
- Play counts are local to one browser and can be changed by clearing storage.
- Payments, accounts, cloud saves, leaderboards, analytics, advertising, and a content-authoring tool are not connected.
- Wikipedia search and Wikidata dates are useful for this prototype but do not guarantee that every selected article describes a single historical event.

## References

- [MediaWiki API: Query](https://www.mediawiki.org/wiki/API:Query)
- [MediaWiki Extension: TextExtracts](https://www.mediawiki.org/wiki/Extension:TextExtracts)
- [Wikidata property P585: point in time](https://www.wikidata.org/wiki/Property:P585)
