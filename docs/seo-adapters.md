# SEO adapters

| Adapter        | Detection                      | v1 writes                                                                              | Notes                                                                                                                |
| -------------- | ------------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Native         | Fallback                       | All normalized fields                                                                  | Plugin-owned protected post meta                                                                                     |
| Yoast SEO      | `WPSEO_VERSION`                | Title, description, focus keyword, canonical, Open Graph title/description/image       | Isolated mapped-meta adapter; regression test required against supported Yoast versions                              |
| Rank Math      | `RANK_MATH_VERSION`            | Title, description, focus keyword, canonical, Facebook title/description/image, robots | Isolated mapped-meta adapter; regression test required against supported Rank Math versions                          |
| All in One SEO | `AIOSEO_VERSION` or `aioseo()` | None                                                                                   | Detected, explicit unsupported-field warnings; no private table mutation without a confirmed stable public write API |

Every response identifies the active provider and a per-field support map. SEO-only operations never send or rewrite article bodies. Unsupported fields produce warnings rather than silent loss.
