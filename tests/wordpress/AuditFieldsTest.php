<?php
/**
 * Autonomous audit allowlist unit tests (no WordPress database required).
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

require_once dirname( __DIR__, 2 ) . '/wordpress/editorial-publisher-for-chatgpt/includes/class-wpcp-autonomous.php';
require_once dirname( __DIR__, 2 ) . '/wordpress/editorial-publisher-for-chatgpt/includes/class-wpcp-audit.php';

/**
 * Tests that only the allowlisted autonomous audit fields are ever kept and
 * that manifest bodies, attestation free text, and junk values are dropped
 * before they can reach the tamper-evident chain (ADR 0006 §6).
 */
final class AuditFieldsTest extends TestCase {
	/** Valid allowlisted fields pass through untouched. */
	public function test_allowlisted_fields_are_kept(): void {
		$input = array(
			'pipeline_id'       => 'tony-trt',
			'pipeline_version'  => '1.2.0',
			'request_hash'      => str_repeat( 'a', 64 ),
			'policy_fingerprint' => str_repeat( 'b', 64 ),
		);
		self::assertSame( $input, WPCP_Audit::sanitize_autonomous_fields( $input ) );
	}

	/** Manifest bodies and attestation free text never reach the chain. */
	public function test_manifest_bodies_and_free_text_are_dropped(): void {
		$input = array(
			'pipeline_id'   => 'tony-trt',
			'manifest_body' => '{"title":"secret draft","body":"full content here"}',
			'attestation'   => 'research notes about sensitive topics',
			'content'       => 'raw markdown body',
			'token'         => 'Bearer abc123',
			'headers'       => 'authorization: Bearer x',
		);
		self::assertSame( array( 'pipeline_id' => 'tony-trt' ), WPCP_Audit::sanitize_autonomous_fields( $input ) );
	}

	/** Invalid allowlisted shapes are dropped, not stored. */
	public function test_invalid_shapes_are_dropped(): void {
		$input = array(
			'pipeline_id'        => 'UPPER-CASE', // fails the id pattern
			'pipeline_version'   => str_repeat( 'v', 65 ), // over max length
			'request_hash'       => 'not-a-hash',
			'policy_fingerprint' => str_repeat( 'c', 63 ),
		);
		self::assertSame( array(), WPCP_Audit::sanitize_autonomous_fields( $input ) );
	}

	/** Non-string and empty values are dropped. */
	public function test_non_string_values_are_dropped(): void {
		$input = array(
			'pipeline_id'       => 123,
			'pipeline_version'  => '',
			'request_hash'      => null,
			'policy_fingerprint' => array( 'nested' => 'value' ),
		);
		self::assertSame( array(), WPCP_Audit::sanitize_autonomous_fields( $input ) );
	}

	/** A pipeline_version is sanitized as scalar text. */
	public function test_pipeline_version_is_scalar_sanitized(): void {
		$result = WPCP_Audit::sanitize_autonomous_fields( array( 'pipeline_version' => "  1.2.0<b>x</b>  " ) );
		self::assertSame( array( 'pipeline_version' => '1.2.0x' ), $result );
	}
}
