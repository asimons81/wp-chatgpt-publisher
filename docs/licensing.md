# Licensing decision

The complete repository uses **GPL-2.0-or-later**.

WordPress itself is GPLv2-or-later, and WordPress.org requires plugins and bundled assets to be GPL-compatible. A split Apache/GPL structure could be legally separable, but it would increase distribution and contribution complexity and Apache-2.0 is not compatible with GPLv2-only code. A single GPL-2.0-or-later license is the clearest conservative choice for this integrated monorepo and is compatible with GPLv3 terms when a recipient chooses the “later” option.

This is a project engineering decision, not legal advice. Before public distribution, verify the generated SBOM and every bundled asset/dependency against current license terms. WordPress.org guidance: https://developer.wordpress.org/plugins/wordpress-org/detailed-plugin-guidelines/#1-plugins-must-be-compatible-with-the-gnu-general-public-license
