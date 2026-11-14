# Design

## Context

`greet(name)` lives in `src/greet.mjs`. The option is additive: existing callers keep their output.

## Decisions

- Add `greet(name, { shout = false } = {})`; when `shout` is true the result is upper-cased.
- No CLI flag in this change.
