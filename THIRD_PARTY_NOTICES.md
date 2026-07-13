# Third-party notices

Production and development dependencies are installed from the pinned `package-lock.json` and `composer.lock` when generated. The authoritative license inventory for a release is the generated CycloneDX SBOM plus package license metadata.

Principal components include the Model Context Protocol TypeScript SDK and MCP Apps extension, React, Express, Zod, jose, PostgreSQL client, Pino, undici, Vite, Vitest, ESLint, Prettier, WordPress Coding Standards, PHPUnit, and PHPStan WordPress extensions. These packages retain their own copyrights and licenses.

No third-party executable code is downloaded by the WordPress plugin at runtime. The release ZIP excludes development dependencies.

Before a public release, run `npm run sbom`, inspect `artifacts/sbom.cdx.json`, and verify every bundled asset and production dependency is GPL-compatible for repository distribution. Report discrepancies as release blockers.
