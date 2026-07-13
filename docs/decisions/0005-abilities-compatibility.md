# ADR 0005: Abilities API is optional discovery, not the v1 contract

Status: accepted — 2026-07-12.

Target WordPress 6.9+ and register a small discoverable ability when the API exists, but keep the complete production contract in explicitly versioned plugin REST routes. Core practical content abilities are still evolving, while the plugin needs stable, independently authorized media, SEO, concurrency, idempotency, and confirmation behavior. Revisit as WordPress 7.x abilities mature.
