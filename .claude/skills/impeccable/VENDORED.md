# Vendored: impeccable

Source: https://github.com/pbakaus/impeccable (`plugin/skills/impeccable`, skill version 4.4.0,
commit 9d715cc4f5564a990ca8345abfdd5df6dc9b41c8).

License: Apache 2.0 (see `LICENSE.txt`); third-party notice in `NOTICE.md`.

Only the guidance markdown is vendored: `SKILL.md` and `reference/`. The upstream `scripts/`
directory is deliberately left out. Its launcher downloads a prebuilt engine binary from the
project's GitHub releases on first run, and the plugin registers hooks that run that binary on
every edit. We do not ship or auto-run downloaded binaries from this repo.

Without `scripts/`, the skill's own "Launcher unavailable" path applies: read the existing project
context directly and follow `reference/new-work.md`, `reference/craft-floor.md` and the command
references by hand. Commands that need the engine (concept-seed, comp-spec, detect, live) are
unavailable; use the written guidance instead.

Re-sync by copying `plugin/skills/impeccable/{SKILL.md,reference/}` from a newer upstream commit
and updating the commit above.
