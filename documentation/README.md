# Documentation

Central index for `france-elections` context — for human collaborators and AI
assistants alike. The goal is that everything needed to understand and contribute
to the project is reachable from here.

## Where each kind of context lives

| You want… | Read |
|---|---|
| **User-facing overview** — what the app does, features, data sources, how to run it | [`../README.md`](../README.md) (repo root) |
| **Deep technical reference** — architecture decisions, every component, data formats, gotchas | [`../CLAUDE.md`](../CLAUDE.md) |
| **Hosting & deployment** — where the app and its heavy data should live, and why | [`hosting-and-deployment.md`](hosting-and-deployment.md) |
| **Roadmap & vision** — expansion plan, future interactivity, agreed decisions | [`roadmap.md`](roadmap.md) |
| **Two-axis navigation** — the time × territory UI-rework design (territory chip, dept insights, timeline, history series) | [`two-axis-navigation.md`](two-axis-navigation.md) |
| **Raw data provenance** — where the ministry source files come from | [`../data-sources/README.md`](../data-sources/README.md) |

## Conventions

- The root [`CLAUDE.md`](../CLAUDE.md) is the canonical **technical** reference; this
  folder holds **planning, strategy, and operational** context that doesn't belong in
  a code-level reference.
- When a decision is made (architecture, hosting, data modelling), record it here so
  it survives across sessions and contributors — don't let it live only in chat or
  one person's head.
- Keep these docs in sync with reality. If you change how something works, update the
  relevant doc in the same change.
