# Game design proposal

This is PR 2 in the Chronicle stack. It adds the playable rules and free-play progression on top of PR 1's dark layout. The demo is not complete until the following question-bank PR is merged.

## Core round

Show five named historical events in a shuffled list. The player orders them oldest to newest, then locks the list. Give one point for each event in its exact position; reveal the years and sources afterward. The result can be copied as a spoiler-free colored grid.

## Puzzle quality rule

Each pack contains exactly five events with unique years, and the span from earliest to latest is at most 15 years. This avoids giveaway pairings across distant eras and keeps ties from making the ordering ambiguous. The app rejects a pack that violates the rule.

## Free and paid modes

Offer one shared daily puzzle and two bonus rounds free each UTC day. The unlimited button is only a paywall mockup. The counter is browser-local and does not prevent a player from clearing storage or changing devices.

## Deferred

This PR does not add payment processing, accounts, server-side scores, or a backend. The static answer data and the content source strategy arrive in PR 3.