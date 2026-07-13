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

- [x] Public HTTPS production service is stable and passes health/readiness probes.
- [ ] OAuth redirect URI shown by the app portal is added exactly; no wildcard.
- [ ] Company, privacy, terms, and support URLs are public.
- [x] Tool scan matches production; annotations and security schemes are accurate.
- [x] Data types returned by tools are disclosed in the privacy policy template; the owner must publish the finalized policy.
- [x] Test prompts have deterministic expected results on the seeded reviewer site.
- [ ] The expanded developer-mode desktop acceptance matrix is complete.
- [x] Mobile MCP acceptance is not applicable; current OpenAI guidance says MCP apps are web-only.
- [x] Icons and screenshots are licensed and sanitized; the demo video script is prepared.
- [ ] Record a demo video only if the current portal requires an uploaded video rather than the prepared script.
- [ ] Owner confirms identity, legal terms, and clicks Submit.

## Smallest owner handoff

1. Open `https://platform.openai.com/plugins`, choose **Create plugin → With MCP**, and complete the **Complete identity verification** prompt. The portal says a verified developer identity is required before creating or uploading a plugin; this is identity verification, not a paid plan selection.
2. Create the development app with `https://editorial-publisher-for-chatgpt.vercel.app/mcp`, complete OAuth, and run the remaining desktop prompts for update, media, metadata, preview, schedule, publish, and revoke. The automated real-MCP E2E already passes these same operations.
3. Supply and publish the final company/developer, privacy, terms, and support URLs and the disposable reviewer account details.
4. Follow the exact [WordPress.org directory handoff](wordpress-submission.md). In both portals, review the final legal confirmations and click Submit. Record the submission receipt/status; do not claim acceptance or listing until the portal provides evidence.

The marketplace legal acceptance used to provision the production database was separate, explicitly on a no-cost plan, and is already complete. OpenAI identity verification and final submission legal confirmations remain account-owner actions.
