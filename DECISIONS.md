# chroniclr — current product decisions

These are the implementation choices in the current prototype and the next decision points. Each can change through a focused pull request.

## Identity and visual direction

The product name is **chroniclr**. The game screen is the primary screen: a large timeline board, tactile event cards, a restrained ink-and-brass palette, and a lightly textured background. The old marketing-style hero copy and the archive pitch are removed. Unlimited play stays as a single control.

## Random-window mode

At the start of each fixed eight-hour UTC edition, a deterministic random seed selects a base year uniformly from 15 through 2016. That year's Wikipedia article and the 14 neighboring annual articles supply event candidates. The game selects one entry from each of five distinct years within the window, shuffles the five, and awards one point for each event in its correct position.

The same edition and base year are shared between players. Each browser gets three rounds; the event selection changes between rounds. A countdown shows time until the next edition, when the base year and free-round counter roll over.

The event source uses the annual article's Events section rather than sampling raw category membership. Each displayed clue is the linked Wikipedia article title from a dated event entry. If the API is unavailable or a window has too few linked events, the random round shows a retry message instead of substituting themed examples. A temporary Shuffle control rerolls a random window or chooses another curated theme without using a daily play.

## Themed mode

The six curated timelines in `data/puzzles.js` are available in a separate mode. Each set has five events with unique years and a maximum 15-year spread. This keeps the authored themed experience available without making it the default.

## Name an event mode

The player sees a target year from 15 through 2016 and enters an event or person through Wikipedia search. Event results need a Wikidata date; person results need a link from an event entry on the target year's annual article. Score is the date-proximity score plus up to 100 rarity points derived from recent Wikipedia page views, falling back to Wikidata sitelinks if page views are unavailable.

## Prototype boundaries

- The question bank is static and client-visible.
- Random-window requests go from the browser to Wikipedia; there is no proxy or editorial cache yet.
- Play counts are local to one browser and can be changed by clearing storage.
- Payments, accounts, cloud saves, leaderboards, analytics, advertising, and a content-authoring tool are not connected.
- Wikipedia search and Wikidata dates are useful for this prototype but do not guarantee that every selected article describes a single historical event.

## References

- [MediaWiki API: Query](https://www.mediawiki.org/wiki/API:Query)
- [MediaWiki API: Revisions](https://www.mediawiki.org/wiki/API:Revisions)
- [Wikidata property P585: point in time](https://www.wikidata.org/wiki/Property:P585)
