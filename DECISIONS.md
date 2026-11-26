# Chronicle — decisions in this demo PR

This is the proposed first playable direction. Treat each item as a reviewable decision, not a claim that the design is final.

## Game loop

**Proposal:** each round shows five named events in a shuffled list. The player orders them from oldest to newest, locks the timeline, then sees each correct year and source. Score one point for each event in its exact position. This keeps the rules visible without a tutorial and gives the result a compact shareable score.

**Time-window rule:** every five-event pack must span no more than 15 years and must not contain duplicate years. The window keeps the answer from being a giveaway across unrelated eras; unique years avoid ambiguous ties in this MVP. `app.js` checks both rules at load time.

**Modes:** one shared daily puzzle plus two bonus rounds are free each UTC day. The Unlimited button is a paywall mockup only. The current six-puzzle demo bank repeats; this is a gameplay prototype, not a content-complete daily service.

## Question bank

**Prototype storage:** curated packs live in `data/puzzles.js` in the repository. The bank is easy to review and version, and the browser has no third-party API dependency during play. The answer years are visible in the static bundle, so this is not secure enough for a real competitive or paid launch.

**Production direction:** keep editorially approved event records in a private content source and serve the current puzzle from a backend endpoint. Do not ship future answer years to the browser. A separate admin/editor experience can come later; this demo does not choose a vendor or database.

## Wikipedia and Wikidata

**Proposal:** use Wikipedia categories and search to discover candidate articles, not as the live question bank. The MediaWiki `categorymembers` API returns pages in a category; it does not make a category a curated set of game-ready events. Wikidata's P585 property can supply a point-in-time value for some events, but date precision and references vary. Human review should choose the event, verify its year against linked sources, write a short neutral clue, and approve each puzzle pack.

The event text in the prototype is written for the game and links to relevant Wikipedia articles. The links are citations for players, not copied article extracts.

References:

- [MediaWiki API:Categorymembers](https://www.mediawiki.org/wiki/API:Categorymembers)
- [MediaWiki API:Search](https://www.mediawiki.org/wiki/API:Search)
- [Wikidata property P585: point in time](https://www.wikidata.org/wiki/Property:P585)

## Visual direction

**Proposal:** use a compact, dark interface with high contrast, editorial mono labels, lime feedback, tight bordered surfaces, and a one-screen game board. Keep the daily counter and unlimited path visible, with no parchment/serif treatment. The visual system is deliberately lightweight so it works as a fast static page.

Reference cues are the daily identity and spoiler-safe share output associated with [Wordle](https://www.nytimes.com/games/wordle/index.html), the daily-plus-unlimited structure in [Globle](https://globle.game/how-to-play), and the compact clue rows in [Countryle](https://countryle.com/). Chronicle keeps its own event-ordering mechanic and visual identity.

## Deliberately deferred

- Payment provider, price, or subscription logic
- Accounts, cloud saves, leaderboards, analytics, and streak syncing
- Production question authoring pipeline and moderation workflow
- Whether game modes beyond sorting should be included
- Public hosting, custom domain, and ad placement
