# Vendored: frontend-design

Source: Anthropic's official `frontend-design` skill, from `claude-plugins-official`
(https://github.com/anthropics/claude-plugins-official/tree/main/plugins/frontend-design),
also distributed as a built-in Claude skill under `/mnt/skills/public/frontend-design`.

License: Apache 2.0 (see `LICENSE.txt` in this directory). Anthropic-authored, no
third-party code, no network calls, no telemetry — pure guidance markdown.

Why vendored instead of relying on the account-level plugin: Keenan asked (2026-09-26)
that every coding thread and coding subagent working on StayPut use the frontend design
skill. The account-level `frontend-design` plugin (same marketplace as `superpowers`)
needs Keenan to enable it once from claude.ai, and even then only helps sessions running
under his account. Vendoring the skill directly into this repo's `.claude/skills/` (the
same pattern already used for `stayput-seo` and `stayput-readme`) makes it load
automatically for anyone — any thread, any subagent, any device — that has this repo (or
`stayput`, where it's also vendored) checked out, with no account setup required.

Unchanged from upstream. Re-sync by copying `/mnt/skills/public/frontend-design/{SKILL.md,LICENSE.txt}`
here if Anthropic updates the skill.
