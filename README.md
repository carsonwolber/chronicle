# chroniclr

chroniclr is a history game about dates and perspective. The default round draws a random year from 15–2016, gathers event entries from the surrounding 15 years, and asks players to put five of them in order.

## Game modes

- **Random window:** one randomly selected year anchors a 15-year window. The game draws Wikipedia article titles from five distinct years in that window.
- **Themed:** play a curated timeline from the local question bank in `data/puzzles.js`.
- **Name an event:** enter an event or a person named in an event on the target year's Wikipedia page. Event dates are checked through Wikidata; accepted people are matched to that year's event list. Closer dates score more, with up to 100 rarity points based on recent Wikipedia page views.

The edition and random year are shared across players in each fixed eight-hour UTC block. The timer counts down to the next block. Progress is stored in browser local storage.

## Wikipedia data

For the random-window mode, chroniclr reads the Events section of Wikipedia's annual articles through the MediaWiki API. It takes linked article titles from dated event entries, draws one candidate from each of five different years inside the selected window, and links each title to its own article. Shuffle can reroll the current round while debugging without spending a daily play.

The event-name mode uses Wikipedia search and the linked Wikidata entity. People are accepted when their article is linked from an event entry on the target year's page. Other results need a supported Wikidata date. A rarity bonus uses recent Wikipedia page views, with Wikidata sitelinks as a fallback estimate.

## Run locally

Serve the repository root with any static file server and open the printed URL. For example:

```sh
python3 -m http.server 8000
```

## Deployment

The GitHub Actions workflow in `.github/workflows/pages.yml` packages the static app and deploys it to GitHub Pages when pushed to `main`.

The app is a static prototype. It has no accounts, payments, subscription handling, or server-side answer protection. Answers are stored in or shipped to the browser.
