# ADR 0003: Four-way authorization intersection

Status: accepted — 2026-07-12.

Effective permission is always the intersection of OAuth/connection scope, the approving WordPress user's current native capability, plugin safety policy, and endpoint/tool requirements. Both service and plugin check independently. Consequential actions additionally require a short-lived single-use confirmation bound to exact action, content, version, schedule payload, and connection. This duplicates checks intentionally to contain compromise.
