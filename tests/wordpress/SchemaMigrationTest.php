<?php
/**
 * Migration and REST schema strictness unit tests (no WordPress database).
 *
 * @package WPChatGPTPublisher
 */

use PHPUnit\Framework\TestCase;

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}
if ( ! isset( $GLOBALS['wpdb'] ) ) {
	/** Minimal test double for the WordPress database object. */
	$GLOBALS['wpdb'] = new class() {
		/** @var string */
		public $prefix = 'wp_';
		/** @var string */
		public $posts = 'wp_posts';
		public function get_charset_collate(): string {
			return 'DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci';
		}
	};
}

require_once dirname( __DIR__, 2 ) . '/wordpress/editorial-publisher-for-chatgpt/includes/class-wpcp-db.php';
require_once dirname( __DIR__, 2 ) . '/wordpress/editorial-publisher-for-chatgpt/includes/class-wpcp-rest-schema.php';

/**
 * Tests the backward-compatible schema migration surface (nullable audit
 * columns) and the strict autonomous REST argument schema.
 */
final class SchemaMigrationTest extends TestCase {
	/** The audit table gains the nullable autonomous columns (ADR 0006 §8). */
	public function test_audit_migration_adds_nullable_autonomous_columns(): void {
		$statement = WPCP_DB::schema_statements()['audit'];
		self::assertStringContainsString( 'pipeline_id varchar(128) NULL', $statement );
		self::assertStringContainsString( 'pipeline_version varchar(64) NULL', $statement );
		self::assertStringContainsString( 'request_hash char(64) NULL', $statement );
		self::assertStringContainsString( 'policy_fingerprint char(64) NULL', $statement );
	}

	/** The migration also indexes the pipeline for the audit-chain rate check. */
	public function test_audit_migration_adds_pipeline_index(): void {
		self::assertStringContainsString( 'KEY pipeline_lookup (pipeline_id,created_at)', WPCP_DB::schema_statements()['audit'] );
	}

	/** Existing tables are untouched by the migration (backward compatibility). */
	public function test_legacy_tables_are_unchanged(): void {
		$statements = WPCP_DB::schema_statements();
		self::assertStringContainsString( 'UNIQUE KEY token_hash (token_hash)', $statements['connections'] );
		self::assertStringContainsString( 'PRIMARY KEY  (connection_id,idempotency_key)', $statements['idempotency'] );
		self::assertStringNotContainsString( 'pipeline_id', $statements['idempotency'] );
	}

	/** dbDelta requires one field definition per line to detect new columns. */
	public function test_schema_statements_are_multiline_for_dbdelta(): void {
		$statements = WPCP_DB::schema_statements();
		foreach ( $statements as $table => $statement ) {
			self::assertStringContainsString( "\n", $statement, "$table statement must be multiline for dbDelta column diffing" );
		}
		$body = substr( $statements['audit'], strpos( $statements['audit'], '(' ) + 1 );
		self::assertMatchesRegularExpression( '/\npipeline_id varchar\(128\) NULL,\n/', $body );
	}

	/** The manifest argument is required, strict, and rejects unknown keys. */
	public function test_validate_manifest_schema_is_strict(): void {
		$schema = WPCP_REST_Schema::for_callback( 'autonomous_validate' )['manifest'];
		self::assertSame( 'object', $schema['type'] );
		self::assertTrue( $schema['required'] );
		self::assertFalse( $schema['additionalProperties'] );
		$properties = $schema['properties'];
		self::assertSame( array( 1 ), $properties['schemaVersion']['enum'] );
		self::assertSame( '^[a-z0-9][a-z0-9._-]*$', $properties['pipelineId']['pattern'] );
		self::assertSame( 'uuid', $properties['requestId']['format'] );
		self::assertSame( array( 'create_draft', 'schedule_draft' ), $properties['intent']['enum'] );
		self::assertFalse( $properties['content']['additionalProperties'] );
		self::assertSame( 'post', $properties['content']['properties']['postType']['default'] );
		self::assertTrue( $properties['content']['properties']['title']['required'] );
		self::assertSame( 'markdown', $properties['content']['properties']['bodyFormat']['default'] );
		self::assertFalse( $properties['schedule']['additionalProperties'] );
		self::assertFalse( $properties['attestations']['additionalProperties'] );
		self::assertFalse( $properties['attestations']['properties']['research']['additionalProperties'] );
		self::assertFalse( $properties['attestations']['properties']['qa']['additionalProperties'] );
	}

	/** Execute requires the policy fingerprint from a prior validate. */
	public function test_execute_requires_expected_policy_fingerprint(): void {
		$args = WPCP_REST_Schema::for_callback( 'autonomous_execute' );
		self::assertArrayHasKey( 'manifest', $args );
		self::assertArrayHasKey( 'expectedPolicyFingerprint', $args );
		self::assertTrue( $args['expectedPolicyFingerprint']['required'] );
		self::assertSame( '^[a-f0-9]{64}$', $args['expectedPolicyFingerprint']['pattern'] );
	}

	/** Body and schedule limits mirror the Zod contract. */
	public function test_manifest_limits_mirror_zod_contract(): void {
		$schema = WPCP_REST_Schema::for_callback( 'autonomous_validate' )['manifest']['properties'];
		self::assertSame( 1000000, $schema['content']['properties']['body']['maxLength'] );
		self::assertSame( 100, $schema['content']['properties']['categories']['maxItems'] );
		self::assertSame( 100, $schema['content']['properties']['tags']['maxItems'] );
		self::assertSame( 200, $schema['content']['properties']['slug']['maxLength'] );
		self::assertSame( 100, $schema['attestations']['properties']['research']['properties']['sources']['maxItems'] );
		self::assertSame( 1000, $schema['attestations']['properties']['research']['properties']['sourceCount']['maximum'] );
		self::assertSame( 50, $schema['attestations']['properties']['qa']['properties']['checks']['maxItems'] );
	}
}
