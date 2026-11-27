# chroniclr

chroniclr is a history game about dates and perspective. The default round draws a random year from 15–2016, gathers event entries from the surrounding 15 years, and asks players to put five of them in order.

## Game modes

- **Random window:** one randomly selected year anchors a 15-year window. The game draws events from five distinct years in that window.
- **Themed:** play a curated timeline from the local question bank in `data/puzzles.js`.
- **Name an event:** get a target year, find a historical event through Wikipedia search, and score `max(0, 1000 − years away)`. The app checks the selected article's linked Wikidata record for a date.

Each browser gets three rounds in each fixed eight-hour UTC block. The edition and random year are shared across players. The timer counts down to the next block. Progress is stored in browser local storage.

## Wikipedia data

For the random-window mode, chroniclr reads the Events section of Wikipedia's annual articles through the MediaWiki API. It draws one candidate from each of five different years inside the selected window and links back to the annual article. Category membership is useful for finding material, but year categories can mix event articles with places, organizations, and broad topic pages; the annual event lists provide dated clues directly.

The event-name mode uses Wikipedia search and the linked Wikidata entity. It checks point in time, inception, start, publication, and end date claims in that order. Some pages have no suitable date; those results are rejected so an undated article cannot receive an arbitrary score.

If Wikipedia is unavailable, random-window mode falls back to the curated local events. This local bank covers only a few time periods.

## Run locally

Serve the repository root with any static file server and open the printed URL. For example:

```sh
python3 -m http.server 8000
```

## Deployment

The GitHub Actions workflow in `.github/workflows/pages.yml` packages the static app and deploys it to GitHub Pages when pushed to `main`.

The app is a static prototype. It has no accounts, payments, subscription handling, or server-side answer protection. Round limits and answers are stored in or shipped to the browser.
