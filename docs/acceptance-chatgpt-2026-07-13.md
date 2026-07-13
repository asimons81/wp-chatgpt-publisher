# ChatGPT developer-mode acceptance - 2026-07-13

## Scope

The production MCP endpoint was installed as a personal developer-mode app in the maintainer's ChatGPT Plus web account. It was connected through the real OAuth flow to a disposable WordPress site exposed only for the test through a temporary HTTPS tunnel.

## Results

| Check                            | Result  | Evidence                                                                                                                                                         |
| -------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App discovery and OAuth          | Pass    | ChatGPT discovered OAuth metadata, completed dynamic registration, redirected through WordPress login and scope approval, and reported the app connected.        |
| Read-only site and content query | Pass    | ChatGPT rendered the connected-site details and the ten most recent items from 43 results without mutation.                                                      |
| Safe draft write                 | Pass    | ChatGPT created post `106` as a draft and explicitly reported that it was not published or scheduled.                                                            |
| Consequential-action gate        | Pass    | ChatGPT rendered the publish review for post `106`, including site, author, status, category, word count, preview, and warning. It stopped without publishing.   |
| Independent state check          | Pass    | WP-CLI reported post `106` as `draft` after the review.                                                                                                          |
| Cleanup                          | Pass    | The disposable draft was deleted, ChatGPT was disconnected from the disposable site, the local URL and password were restored, and the HTTPS tunnel was stopped. |
| ChatGPT mobile client            | N/A     | Current OpenAI guidance says MCP apps are web-only; embedded cards separately pass 390 px browser QA.                                                            |
| Expanded desktop matrix          | Blocked | The current OpenAI developer portal requires owner-specific developer identity verification before the app can be recreated or uploaded.                         |

No real WordPress content or production credential was used. No OAuth token, WordPress password, or confirmation token is recorded in this evidence.

On the final release audit, the signed-in OpenAI developer portal reached **Create plugin → With MCP** and then displayed **Complete identity verification**, stating that a verified developer identity is required before a plugin can be created or uploaded. The flow was cancelled before collecting identity data. After the owner completes that prompt, rerun draft update, image, metadata, preview, scheduling, publishing, and revocation inside ChatGPT; these operations already pass through the same production code path in the real-MCP E2E suite.
