# ADR 0001: Remote MCP service with WordPress REST plugin

Status: accepted — 2026-07-12.

Use an open-source TypeScript MCP service over HTTPS and a narrowly scoped WordPress REST plugin. Do not implement full MCP transport in PHP. This gives ChatGPT-compatible OAuth/transport behavior, hosting portability, a clean protocol boundary, and broad WordPress hosting compatibility. Cost: operators deploy a small Node/PostgreSQL service. No proprietary relay is required.
