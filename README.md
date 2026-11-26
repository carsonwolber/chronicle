# Chronicle

Chronicle is a daily history game about putting five events in chronological order. Every round is drawn from a curated time window of 15 years or less.

## Run the demo

Serve this directory with any static file server, then open `index.html`. For example:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## Current demo

- One shared daily round followed by two free bonus rounds.
- Reorder five event cards and score one point per event in its exact position.
- See the answer years and source links after locking in.
- The free-play counter is stored in this browser and resets at UTC midnight.
- The unlimited button is a nonfunctional paywall mockup.

The six sample rounds are curated demo content. They rotate as daily puzzles, so the bank is intentionally small and repeats.

## Question data

The prototype's puzzle bank lives in `data/puzzles.js`. Each pack has five events with unique years, source links, and a maximum 15-year spread. The app enforces these rules when it loads.

For candidate discovery, Wikipedia category membership can provide a starting list of articles. Wikidata's point-in-time property (P585) can help find dates. Neither should publish a puzzle without editorial review: category membership is broad, date precision and sourcing vary, and the event wording needs to be short and unambiguous. The game itself reads a curated local bank rather than querying Wikipedia while someone is playing.

The answer years are included in this static demo and can be inspected in browser source. Before a public paid launch, the daily answer should come from a server endpoint so future solutions are not shipped to every browser. The demo has no payment processing, accounts, or backend.

## Design notes

See [DECISIONS.md](DECISIONS.md) for the proposed game, question-bank, and source workflow decisions included for review.
