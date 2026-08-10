<?php
/**
 * Autonomous policy surface unit tests (no WordPress database required).
 *
 * @package WPChatGPTPublisher
 */

use PHPUnit\Framework\TestCase;

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}
if ( ! function_exists( 'wp_json_encode' ) ) {
	/** Minimal test double for WordPress's JSON encoder. */
	function wp_json_encode( $value ): string|false {
		return json_encode( $value, JSON_UNESCAPED_UNICODE );
	}
}
if ( ! function_exists( '__' ) ) {
	/** Minimal test double for WordPress's translation function. */
	function __( string $text, string $domain = 'default' ): string {
		return $text;
	}
}
if ( ! function_exists( 'sanitize_text_field' ) ) {
	/** Minimal test double for WordPress's scalar sanitizer. */
	function sanitize_text_field( string $value ): string {
		return trim( strip_tags( $value ) );
	}
}
if ( ! function_exists( 'get_option' ) ) {
	/** Test-controlled option store for read_policy(). */
	function get_option( string $name, $default = false ) {
		return array_key_exists( $name, (array) ( $GLOBALS['wpcp_test_options'] ?? array() ) ) ? $GLOBALS['wpcp_test_options'][ $name ] : $default;
	}
}
if ( ! class_exists( 'WP_Error' ) ) {
	/** Minimal test double for WordPress's error object. */
	class WP_Error {
		/** @var string */
		public $code = '';
		/** @var string */
		public $message = '';
		/** @var mixed */
		public $data = '';
		public function __construct( string $code = '', string $message = '', $data = '' ) {
			$this->code    = $code;
			$this->message = $message;
			$this->data    = $data;
		}
		public function get_error_code(): string {
			return $this->code;
		}
	}
}

require_once dirname( __DIR__, 2 ) . '/wordpress/editorial-publisher-for-chatgpt/includes/class-wpcp-autonomous.php';

/**
 * Tests the autonomous site policy surface: fail-closed parsing, kill-switch
 * ordering, fingerprint determinism, version gates, manifest normalization,
 * and the request hash used by the reservation.
 */
final class AutonomousPolicyTest extends TestCase {
	/** @var array<string,mixed> A valid enabled policy naming one pipeline. */
	private array $enabled_policy = array(
		'schemaVersion'    => 1,
		'enabled'          => true,
		'allowedPipelines' => array(
			array(
				'pipelineId'         => 'tony-trt',
				'minPipelineVersion' => '1.2.0',
				'limits'             => array(
					'maxRequestsPerHour' => 5,
					'maxRequestsPerDay'  => 10,
					'maxScheduledPerDay' => 3,
				),
			),
		),
	);

	/** @return array<string,array{0:mixed,1:string}> */
	public static function disabled_policy_provider(): array {
		return array(
			'missing option'      => array( null, 'null' ),
			'empty string'        => array( '', 'empty' ),
			'malformed json'      => array( '{not json', 'malformed' ),
			'non-object'          => array( '[]', 'array' ),
			'unknown field'       => array( '{"schemaVersion":1,"enabled":true,"adminBypass":true}', 'unknown' ),
			'wrong schema version' => array( '{"schemaVersion":2,"enabled":true}', 'future' ),
			'enabled not boolean' => array( '{"schemaVersion":1,"enabled":"yes"}', 'string-bool' ),
			'pipelines not array' => array( '{"schemaVersion":1,"enabled":true,"allowedPipelines":"x"}', 'bad-pipelines' ),
			'descriptor unknown field' => array( '{"schemaVersion":1,"enabled":true,"allowedPipelines":[{"pipelineId":"p","minPipelineVersion":"1","limits":{},"rateLimit":9}]}', 'descriptor-unknown' ),
			'descriptor missing version' => array( '{"schemaVersion":1,"enabled":true,"allowedPipelines":[{"pipelineId":"p","limits":{}}]}', 'descriptor-missing-version' ),
			'limits out of range' => array( '{"schemaVersion":1,"enabled":true,"allowedPipelines":[{"pipelineId":"p","minPipelineVersion":"1","limits":{"maxRequestsPerHour":0}}]}', 'limits-range' ),
			'limits unknown field' => array( '{"schemaVersion":1,"enabled":true,"allowedPipelines":[{"pipelineId":"p","minPipelineVersion":"1","limits":{"maxRequestsPerMinute":5}}]}', 'limits-unknown' ),
		);
	}

	/** @dataProvider disabled_policy_provider */
	public function test_malformed_or_unknown_policies_fail_closed( $raw, string $label ): void {
		self::assertNull( WPCP_Autonomous::parse_policy( $raw ), "policy should fail closed for: $label" );
	}

	/** The kill switch is checked before any other gate, even for allowed pipelines. */
	public function test_kill_switch_first_overrides_pipeline_allowance(): void {
		$disabled = $this->enabled_policy;
		$disabled['enabled'] = false;
		self::assertSame(
			'autonomous_disabled',
			WPCP_Autonomous::first_gate_violation( WPCP_Autonomous::parse_policy( $disabled ), 'tony-trt', '9.9.9' )
		);
		self::assertSame(
			'autonomous_disabled',
			WPCP_Autonomous::first_gate_violation( null, 'tony-trt', '9.9.9' )
		);
	}

	/** A missing option reads as a disabled policy. */
	public function test_read_policy_missing_option_is_disabled(): void {
		$GLOBALS['wpcp_test_options'] = array();
		$read = WPCP_Autonomous::read_policy();
		self::assertNull( $read['policy'] );
		self::assertNull( $read['fingerprint'] );
	}

	/** An enabled policy is read at call time with its fingerprint. */
	public function test_read_policy_returns_parsed_policy_and_fingerprint(): void {
		$GLOBALS['wpcp_test_options'] = array( WPCP_Autonomous::POLICY_OPTION => wp_json_encode( $this->enabled_policy ) );
		$read = WPCP_Autonomous::read_policy();
		self::assertNotNull( $read['policy'] );
		self::assertTrue( $read['policy']['enabled'] );
		self::assertMatchesRegularExpression( '/^[a-f0-9]{64}$/', (string) $read['fingerprint'] );
	}

	/** Unknown-field policies are disabled, not partially accepted. */
	public function test_unknown_top_level_field_disables_policy(): void {
		self::assertNull( WPCP_Autonomous::parse_policy( '{"schemaVersion":1,"enabled":true,"mystery":1}' ) );
	}

	/** schemaVersion is pinned; any other value fails closed. */
	public function test_schema_version_is_pinned_to_one(): void {
		self::assertNotNull( WPCP_Autonomous::parse_policy( '{"schemaVersion":1}' ) );
		self::assertNull( WPCP_Autonomous::parse_policy( '{"schemaVersion":0,"enabled":true}' ) );
		self::assertNull( WPCP_Autonomous::parse_policy( '{"schemaVersion":"1","enabled":true}' ) );
	}

	/** Missing fields default exactly like the Zod contract. */
	public function test_policy_defaults_materialize(): void {
		$policy = WPCP_Autonomous::parse_policy( '{"schemaVersion":1}' );
		self::assertIsArray( $policy );
		self::assertFalse( $policy['enabled'] );
		self::assertSame( array(), $policy['allowedPipelines'] );
	}

	/** Limits default and validate like the Zod contract. */
	public function test_limits_defaults_and_ranges(): void {
		self::assertSame(
			array( 'maxRequestsPerHour' => 20, 'maxRequestsPerDay' => 100, 'maxScheduledPerDay' => 20 ),
			WPCP_Autonomous::parse_limits( null )
		);
		self::assertSame(
			array( 'maxRequestsPerHour' => 20, 'maxRequestsPerDay' => 100, 'maxScheduledPerDay' => 20 ),
			WPCP_Autonomous::parse_limits( array() )
		);
		self::assertNull( WPCP_Autonomous::parse_limits( array( 'maxRequestsPerDay' => 10001 ) ) );
		self::assertNull( WPCP_Autonomous::parse_limits( array( 'maxRequestsPerHour' => 1.5 ) ) );
		self::assertNull( WPCP_Autonomous::parse_limits( array( 'maxScheduledPerDay' => -1 ) ) );
	}

	/** Pipeline allowlist and version gates. */
	public function test_pipeline_gates(): void {
		$policy = WPCP_Autonomous::parse_policy( wp_json_encode( $this->enabled_policy ) );
		self::assertIsArray( $policy );
		self::assertNull( WPCP_Autonomous::first_gate_violation( $policy, 'tony-trt', '1.2.0' ) );
		self::assertSame( 'pipeline_version_mismatch', WPCP_Autonomous::first_gate_violation( $policy, 'tony-trt', '1.1.9' ) );
		self::assertSame( 'pipeline_not_allowed', WPCP_Autonomous::first_gate_violation( $policy, 'other-pipeline', '9.9.9' ) );
	}

	/** The fingerprint is deterministic across key order and whitespace. */
	public function test_fingerprint_is_canonical_and_stable(): void {
		$first  = WPCP_Autonomous::parse_policy( wp_json_encode( $this->enabled_policy ) );
		$second = WPCP_Autonomous::parse_policy( ' { "allowedPipelines" : [ { "minPipelineVersion" : "1.2.0", "limits" : { "maxScheduledPerDay" : 3, "maxRequestsPerDay" : 10, "maxRequestsPerHour" : 5 }, "pipelineId" : "tony-trt" } ], "enabled" : true, "schemaVersion" : 1 } ' );
		self::assertIsArray( $first );
		self::assertIsArray( $second );
		self::assertSame( WPCP_Autonomous::fingerprint( $first ), WPCP_Autonomous::fingerprint( $second ) );
	}

	/** A changed policy changes the fingerprint. */
	public function test_fingerprint_changes_with_policy(): void {
		$changed                              = $this->enabled_policy;
		$changed['allowedPipelines'][0]['limits']['maxScheduledPerDay'] = 4;
		$before = WPCP_Autonomous::parse_policy( wp_json_encode( $this->enabled_policy ) );
		$after  = WPCP_Autonomous::parse_policy( wp_json_encode( $changed ) );
		self::assertIsArray( $before );
		self::assertIsArray( $after );
		self::assertNotSame( WPCP_Autonomous::fingerprint( $before ), WPCP_Autonomous::fingerprint( $after ) );
	}

	/** Canonical JSON sorts object keys recursively and drops whitespace. */
	public function test_canonical_json_is_sorted_and_compact(): void {
		self::assertSame(
			'{"a":{"x":1,"y":2},"b":1,"c":[1,2]}',
			WPCP_Autonomous::canonical_json( array( 'c' => array( 1, 2 ), 'a' => array( 'y' => 2, 'x' => 1 ), 'b' => 1 ) )
		);
	}

	/** @return array<string,array{0:string,1:string,2:bool}> */
	public static function version_provider(): array {
		return array(
			'equal'              => array( '1.2.0', '1.2.0', true ),
			'patch above'        => array( '1.2.1', '1.2.0', true ),
			'minor below'        => array( '1.1.9', '1.2.0', false ),
			'major above'        => array( '2.0.0', '1.9.9', true ),
			'pre-release fails'  => array( '1.2.0-beta', '1.2.0', false ),
			'release beats pre'  => array( '1.2.0', '1.2.0-beta', true ),
			'rc2 beats rc1'      => array( '1.2.0-rc2', '1.2.0-rc1', true ),
			'shorter min'        => array( '1.2', '1', true ),
			'longer min missing' => array( '1.2', '1.2.1', false ),
			'leading zeros'      => array( '1.2.08', '1.2.8', true ),
		);
	}

	/** @dataProvider version_provider */
	public function test_version_at_least( string $version, string $minimum, bool $expected ): void {
		self::assertSame( $expected, WPCP_Autonomous::version_at_least( $version, $minimum ) );
	}

	/** Manifest defaults materialize and the schedule refine is enforced. */
	public function test_normalize_manifest_defaults_and_refine(): void {
		$base = array(
			'schemaVersion'    => 1,
			'pipelineId'       => 'tony-trt',
			'pipelineVersion'  => '1.2.0',
			'requestId'        => '7c9e6679-7425-40de-944b-e07fc1f90ae7',
			'intent'           => 'create_draft',
			'content'          => array( 'title' => 'T', 'body' => 'B' ),
			'attestations'     => array(
				'research' => array( 'performedAt' => '2026-08-10T00:00:00Z', 'sourceCount' => 2 ),
				'qa'       => array( 'performedAt' => '2026-08-10T00:00:00Z', 'passed' => true ),
			),
		);
		$normalized = WPCP_Autonomous::normalize_manifest( $base );
		self::assertIsArray( $normalized );
		self::assertSame( 'post', $normalized['content']['postType'] );
		self::assertSame( 'markdown', $normalized['content']['bodyFormat'] );
		self::assertSame( array(), $normalized['content']['categories'] );
		self::assertSame( array(), $normalized['attestations']['research']['sources'] );
		self::assertSame( array(), $normalized['attestations']['qa']['checks'] );
		$scheduled = $base;
		$scheduled['intent'] = 'schedule_draft';
		self::assertInstanceOf( WP_Error::class, WPCP_Autonomous::normalize_manifest( $scheduled ) );
	}

	/** The request hash is canonical and binds manifest + connection + policy. */
	public function test_request_hash_binds_manifest_connection_and_policy(): void {
		$manifest_a = array(
			'pipelineId'      => 'tony-trt',
			'pipelineVersion' => '1.2.0',
			'requestId'       => '7c9e6679-7425-40de-944b-e07fc1f90ae7',
			'intent'          => 'create_draft',
			'content'         => array( 'title' => 'T', 'body' => 'B' ),
		);
		$reordered = array(
			'content'         => array( 'body' => 'B', 'title' => 'T' ),
			'intent'          => 'create_draft',
			'requestId'       => '7c9e6679-7425-40de-944b-e07fc1f90ae7',
			'pipelineVersion' => '1.2.0',
			'pipelineId'      => 'tony-trt',
		);
		$fingerprint = str_repeat( 'a', 64 );
		self::assertSame(
			WPCP_Autonomous::request_hash( $manifest_a, 'conn-1', $fingerprint ),
			WPCP_Autonomous::request_hash( $reordered, 'conn-1', $fingerprint )
		);
		self::assertNotSame(
			WPCP_Autonomous::request_hash( $manifest_a, 'conn-1', $fingerprint ),
			WPCP_Autonomous::request_hash( $manifest_a, 'conn-2', $fingerprint )
		);
		$different = $manifest_a;
		$different['content']['title'] = 'U';
		self::assertNotSame(
			WPCP_Autonomous::request_hash( $manifest_a, 'conn-1', $fingerprint ),
			WPCP_Autonomous::request_hash( $different, 'conn-1', $fingerprint )
		);
	}

	/** Pipeline id validation rejects unsafe values. */
	public function test_pipeline_id_pattern(): void {
		self::assertTrue( WPCP_Autonomous::is_valid_pipeline_id( 'tony-trt' ) );
		self::assertTrue( WPCP_Autonomous::is_valid_pipeline_id( 'a.b_c-1' ) );
		self::assertFalse( WPCP_Autonomous::is_valid_pipeline_id( 'UPPER' ) );
		self::assertFalse( WPCP_Autonomous::is_valid_pipeline_id( '-leading' ) );
		self::assertFalse( WPCP_Autonomous::is_valid_pipeline_id( str_repeat( 'a', 129 ) ) );
	}
}
