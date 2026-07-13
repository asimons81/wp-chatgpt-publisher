# WordPress.org directory submission

This is the exact account-owner handoff for the WordPress.org Plugin Directory. The current sources are the [submission form](https://wordpress.org/plugins/developers/add/), [18 directory guidelines](https://developer.wordpress.org/plugins/wordpress-org/detailed-plugin-guidelines/), [readme standard](https://developer.wordpress.org/plugins/wordpress-org/how-your-readme-txt-works/), [SVN guide](https://developer.wordpress.org/plugins/wordpress-org/how-to-use-subversion/), and [asset rules](https://developer.wordpress.org/plugins/wordpress-org/plugin-assets/). Recheck them immediately before submitting.

## Prepared submission

- Display name: **Editorial Publisher for ChatGPT**
- Proposed slug: `editorial-publisher-for-chatgpt`
- Version: `1.0.2`
- Upload: `editorial-publisher-for-chatgpt-1.0.2.zip` from the public GitHub release
- Main file: `editorial-publisher-for-chatgpt/editorial-publisher-for-chatgpt.php`
- License: `GPL-2.0-or-later`
- WordPress: requires 6.9, tested through the 7.0 release line
- PHP: 8.1 through 8.4 tested

The official WordPress.org readme validator reports no errors or warnings. Its only notes are optional Upgrade Notice, Screenshots, and Donate Link sections. Official Plugin Check reports no errors, and the public ZIP installs and activates in a fresh WordPress instance.

The proposed slug had no exact Plugin Directory match on 2026-07-13. Availability is not reserved until WordPress.org accepts the submission. The trademark appears after the connector word “for,” matching guideline 17’s non-affiliation naming pattern; WordPress.org makes the final name and slug decision.

## Guideline audit

|   # | Status       | Evidence                                                                                                                                                                |
| --: | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | Pass         | Main header and `readme.txt` declare `GPL-2.0-or-later` with the GNU license URI; the packaged PHP/CSS is project-owned and the repository carries the same license.    |
|   2 | Pass         | The ZIP contains reviewed project source only, with no bundled vendor library or unlicensed image.                                                                      |
|   3 | Ready        | `Stable tag`, plugin header, runtime constant, changelog, and GitHub release are all 1.0.2. After approval, publish the same files to SVN trunk and `tags/1.0.2`.       |
|   4 | Pass         | PHP and CSS are human-readable. Complete source, build scripts, and history are public on GitHub.                                                                       |
|   5 | Pass         | No license key, trial, artificial quota, paid unlock, or upsell exists.                                                                                                 |
|   6 | Pass         | The genuine OAuth/MCP service performs connection storage and request forwarding, is documented in `readme.txt`, is GPL-licensed, and can be self-hosted.               |
|   7 | Pass         | Activation sends no external request. The user explicitly initiates connection and media requests; telemetry is off by default and the readme discloses processed data. |
|   8 | Pass         | Admin CSS is packaged locally; there is no remote executable code, installer, or self-updater.                                                                          |
|   9 | Pass         | No deceptive, illegal, review-manipulation, compliance-guarantee, cryptomining, or hidden behavior was found.                                                           |
|  10 | Pass         | The plugin adds no public credit or forced backlink.                                                                                                                    |
|  11 | Pass         | Admin screens are native, capability-checked WordPress pages with no iframe, ad, upsell, or global nag.                                                                 |
|  12 | Pass         | `readme.txt` uses five relevant tags, no affiliate link, and a 150-character human-readable summary.                                                                    |
|  13 | Pass         | No library already shipped by WordPress is bundled.                                                                                                                     |
|  14 | Ready        | GitHub remains the development repository; the WordPress.org SVN repository will receive one reviewed release commit, not development churn.                            |
|  15 | Pass         | 1.0.2 is consistent across package metadata, PHP, readme, tests, changelog, release notes, and archive names.                                                           |
|  16 | Pass         | The plugin is complete, installable, tested, and backed by a working production service plus self-hosting instructions.                                                 |
|  17 | Ready        | The name is functional and distinctive; “ChatGPT” follows “for.” No exact slug match was found, but the owner must accept WordPress.org’s final name/slug decision.     |
|  18 | Acknowledged | WordPress.org retains directory enforcement and safety authority.                                                                                                       |

This is an engineering review, not trademark or legal advice.

## Owner submission steps

1. Confirm that `asimons81` is the exact, case-sensitive WordPress.org username that should appear as the contributor. If not, update `Contributors:` and rebuild before upload.
2. Sign in at the [Add your plugin](https://wordpress.org/plugins/developers/add/) page with that account.
3. Upload the exact public `editorial-publisher-for-chatgpt-1.0.2.zip`. Do not upload the source archive.
4. If the form offers a one-time slug choice before review begins, select `editorial-publisher-for-chatgpt` if it remains available.
5. Review the directory terms and submit. Save the submission URL, timestamp, and confirmation email.
6. Reply promptly to the human review team. Never email from an autoresponder or ticket-system address; WordPress.org requires reachable developer contact information.

WordPress.org says reviews commonly take 1–10 days and cannot be expedited. Submission does not publish the plugin; approval creates the SVN repository.

## After approval

Use the WordPress.org username and an SVN-specific password. Replace `WORDPRESS_ORG_USERNAME` only; the slug and version below are final for this release.

```sh
svn checkout https://plugins.svn.wordpress.org/editorial-publisher-for-chatgpt wordpress-svn
# Extract the release ZIP outside the SVN checkout, then copy the files from
# editorial-publisher-for-chatgpt/ into wordpress-svn/trunk/ (not a nested folder).
cd wordpress-svn
svn add --force trunk
svn status
svn copy trunk tags/1.0.2
svn commit -m "Release Editorial Publisher for ChatGPT 1.0.2" --username WORDPRESS_ORG_USERNAME
```

Do not commit the ZIP itself. Confirm that `trunk/readme.txt` points to `Stable tag: 1.0.2` and that `tags/1.0.2` is immutable. If Release Confirmation is enabled, use the emailed tokenized link to approve the pending release in WordPress.org’s Release Management dashboard.

Directory artwork is not required for the initial ZIP review. After approval, place correctly named assets at the SVN root `assets/`, not inside the plugin ZIP: `icon.svg`, `icon-128x128.png`, `icon-256x256.png`, optional `banner-772x250.png`/`banner-1544x500.png`, and numbered screenshots with matching `readme.txt` captions.
