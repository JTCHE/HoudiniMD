# Code

## One source of truth

Each value, shape, and rule lives in one place. Paths, asset shapes, design
tokens, and defaults get one definition that every caller imports. A value
written twice will drift.

The two halves count as one codebase. A rule the Rust side decides — what an
asset path looks like, what a page payload holds — is decided there once, and
the front-end consumes it. Do not re-derive it in TypeScript.

If you find the same value in two files, that is a bug. Fix the duplication
before you fix the symptom.

## Small modules

Split by purpose, not by size. A module does one thing and says so in its name.
Shared logic goes in a module both callers import — never copied, never
re-implemented.

Orchestration goes in the entry points and the indexes. One-purpose logic goes
in focused modules that they call.

## Dependencies

Prefer a maintained library when it removes more complexity than it adds. Use
what the project already has before you write your own or add a package. Read
the documentation and the types before you decide a library cannot do it.

Weigh a front-end package against the window it runs in. This app ships no
JavaScript runtime and starts in well under a second; a package that costs a
megabyte to draw one control is not worth it.

## Change discipline

- Fix the cause, not the symptom. Before you edit a function, find every caller.
  One guard in the shared function beats a guard in each caller.
- Choose the simplest code that meets the current requirement. Do not add
  configuration, indirection, or abstraction for a need that does not exist yet.
- Grow the system in layers. Start with the smallest version that works from end
  to end, then add on top of a product that already works. Never trade a working
  product for unfinished complexity.
- Make the decision for the long term. Do not accept a stopgap that you plan to
  replace.
- Delete more than you add when you can.
- Use names that explain themselves. `positionX`, not `pX`.
- Write a comment only when the code cannot show the reason. Keep it to one or
  two lines, next to the code it explains. A comment that needs a paragraph to
  defend a workaround means the code is wrong — fix the code.
