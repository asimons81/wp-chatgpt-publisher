<?php
/**
 * Scope policy unit tests that do not require a WordPress database.
 *
 * @package WPChatGPTPublisher
 */

use PHPUnit\Framework\TestCase;

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}
if ( ! function_exists( 'sanitize_text_field' ) ) {
	/** Minimal test double for WordPress's scalar sanitizer. */
	function sanitize_text_field( string $value ): string {
		return trim( strip_tags( $value ) );
	}
}

require_once dirname( __DIR__, 2 ) . '/wordpress/editorial-publisher-for-chatgpt/includes/class-wpcp-scopes.php';

/** Tests the connection scope policy independently of WordPress roles. */
final class ScopesTest extends TestCase {
	/** Editorial connections must not include consequential scopes. */
	public function test_editorial_profile_excludes_consequential_scopes(): void {
		self::assertNotContains( 'published:edit', WPCP_Scopes::EDITORIAL );
		self::assertNotContains( 'publish:schedule', WPCP_Scopes::EDITORIAL );
		self::assertNotContains( 'publish:execute', WPCP_Scopes::EDITORIAL );
	}

	/** Required scopes are evaluated as an all-of set. */
	public function test_scope_intersection_requires_every_scope(): void {
		self::assertTrue( WPCP_Scopes::has( array( 'site:read', 'content:read' ), array( 'site:read' ) ) );
		self::assertFalse( WPCP_Scopes::has( array( 'site:read' ), array( 'site:read', 'publish:execute' ) ) );
	}

	/** Sanitization removes unknown and duplicate scopes. */
	public function test_scope_sanitization_is_allowlist_based(): void {
		self::assertSame( array( 'site:read' ), WPCP_Scopes::sanitize( array( 'site:read', 'site:read', 'code:execute' ) ) );
	}
}
