# Agent instructions

These instructions apply to the entire repository.

1. Read [`docs/agent-guide.md`](docs/agent-guide.md) before changing code or setting up the project. It is the canonical agent briefing, repository map, setup playbook, and verification guide.
2. Preserve existing user changes. Start with `git status --short` and never discard, overwrite, stage, or commit unrelated files.
3. Treat the repository as three cooperating systems: the Node MCP service, the embedded ChatGPT UI, and the WordPress plugin. Identify which boundary a task affects before editing.
4. Preserve the security model. Never bypass scope checks, WordPress capability checks, confirmation tokens, PKCE, SSRF controls, MIME validation, redaction, or fail-closed production configuration to make a test pass.
5. Use `npm ci` for reproducible setup and the scripts in the root `package.json` for builds and checks. Do not invent parallel setup paths when a repository script exists.
6. The Docker Compose topology and fixture credentials are disposable local/CI resources only. Do not point seed scripts or test credentials at a real site.
7. Do not deploy, publish, rotate secrets, migrate a production database, remove Docker volumes, or connect a real WordPress site unless the user explicitly requests that action and the target is confirmed.
8. Never expose or commit `.env` contents, tokens, passwords, private content, database dumps, or generated release artifacts.

For a normal code change, run the smallest relevant checks while iterating and the full applicable verification ladder from the agent guide before handoff.
