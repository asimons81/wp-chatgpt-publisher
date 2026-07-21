<?php
/**
 * OAuth callback-handoff regression tests.
 *
 * @package WPChatGPTPublisher
 */

use PHPUnit\Framework\TestCase;

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}
if ( ! function_exists( 'esc_url_raw' ) ) {
	function esc_url_raw( string $url ): string {
		return $url;
	}
}
if ( ! function_exists( 'esc_url' ) ) {
	function esc_url( string $url ): string {
		return htmlspecialchars( $url, ENT_QUOTES, 'UTF-8' );
	}
}
if ( ! function_exists( 'esc_attr' ) ) {
	function esc_attr( string $value ): string {
		return htmlspecialchars( $value, ENT_QUOTES, 'UTF-8' );
	}
}
if ( ! function_exists( 'esc_html__' ) ) {
	function esc_html__( string $text ): string {
		return $text;
	}
}
if ( ! function_exists( 'wp_json_encode' ) ) {
	function wp_json_encode( string $value, int $flags = 0 ): string|false {
		return json_encode( $value, $flags );
	}
}

require_once dirname( __DIR__, 2 ) . '/wordpress/editorial-publisher-for-chatgpt/includes/class-wpcp-admin.php';

/** Verifies that an approved callback can survive a host that strips Location headers. */
final class OAuthHandoffTest extends TestCase {
	public function test_callback_handoff_preserves_query_string_in_html_and_javascript(): void {
		$callback = 'https://publisher.example/connect/callback?flow=flow-id&grant=one-time-grant';
		$document = WPCP_Admin::callback_handoff_document( $callback );

		self::assertStringContainsString( 'http-equiv="refresh"', $document );
		self::assertStringContainsString( 'flow=flow-id&amp;grant=one-time-grant', $document );
		self::assertStringContainsString( 'window.location.replace(', $document );
		self::assertStringContainsString( 'flow=flow-id\\u0026grant=one-time-grant', $document );
	}
}
