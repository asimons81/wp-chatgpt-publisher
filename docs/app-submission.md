# OpenAI app submission package

Current source of truth: [OpenAI Apps SDK submission documentation](https://developers.openai.com/apps-sdk/deploy/submission). Re-verify immediately before submission.

## Listing copy

**Name:** Editorial Publisher for ChatGPT

**Short description:** Securely search, draft, preview, schedule, and publish WordPress content from ChatGPT after site-side permission approval.

**Value statement:** No OpenAI API key required. No separate pay-per-token OpenAI API bill from this plugin. ChatGPT plan limits apply.

**Category:** Productivity / developer and publishing tools (select the closest current portal category).

## Required URLs and contacts

- Production MCP: `https://editorial-publisher-for-chatgpt.vercel.app/mcp` (publish only after `/readyz` passes)
- Company/developer website: `[URL]`
- Privacy policy: publish `docs/privacy-policy-template.md` after legal review
- Terms: publish `docs/terms-template.md` after legal review
- Support: `[URL or monitored address]`
- OAuth discovery and protected-resource metadata: production service well-known URLs

## Tool and safety explanation

Tools cover site health, compact content discovery, selected retrieval, drafts, revisions, taxonomy assignment, verified image handling, normalized SEO metadata, structured preview, and explicitly confirmed scheduling/publishing. Every action is bounded by OAuth scope, WordPress connection scope, the approving user's current native capability, and plugin policy. No user/plugin/theme/settings/code/database/filesystem management or permanent deletion exists.

Write tools use idempotency; stale edits fail. Publishing/scheduling/published edits require a short-lived single-use token bound to connection, action, content, version, and intended schedule. Retrieved site content is untrusted text and cannot modify tools, scopes, or system behavior.

## Reviewer workflow

Provide a disposable HTTPS WordPress site with seeded content and two accounts: Editorial connection and Publisher connection. Do not provide primary administrator credentials to the app. Supply reviewer instructions to connect through WordPress approval, then run:

1. Get site and search `release safety`.
2. Retrieve one result in Markdown.
3. Create and update a draft with provided idempotency keys.
4. Upload the supplied benign image and set alt text/featured image.
5. Assign existing category/tag and native SEO metadata.
6. Review the draft.
7. Attempt publish with Editorial and observe scope denial.
8. Connect Publisher, request publish, review card, confirm, and verify URL.
9. Reuse confirmation and observe denial.
10. Revoke in WordPress and observe later call failure.

## Test prompts and expected behavior

Include direct, indirect, and negative prompts from `docs/chatgpt-setup.md`. For every tool, list expected arguments, user-visible fields, side effects, annotation, and error case. Portal tool scan must match `docs/tool-reference.md` exactly.

## Assets to prepare

- Square app icon at 1024px and 512px, plus its SVG master and [license record](assets/brand/README.md)
- Optional sanitized screenshots for connected site, search, draft review, metadata, media, confirmation, result, and reconnect states
- 60–90 second demo video following [the prepared script](demo-script.md)
- Localization information requested by the portal

No assets may imply OpenAI endorsement, use unapproved brand treatments, contain personal data, or show credentials.

## Submission checklist

- [ ] Public HTTPS production service is stable and low latency.
- [ ] OAuth redirect URI shown by the app portal is added exactly; no wildcard.
- [ ] Company, privacy, terms, and support URLs are public.
- [ ] Tool scan matches production; annotations and security schemes are accurate.
- [ ] Data types returned by tools are disclosed in the privacy policy.
- [ ] Test prompts have deterministic expected results on the reviewer site.
- [ ] Developer-mode desktop and mobile acceptance evidence is complete.
- [ ] Icons/screenshots/video are licensed and sanitized.
- [ ] Owner confirms identity, legal terms, and clicks Submit.

Account-gated final action: the repository owner must authenticate to the current OpenAI Developer Platform, enter final URLs/contact/company details, accept current legal confirmations, and submit. Do not claim acceptance or listing without portal evidence.
