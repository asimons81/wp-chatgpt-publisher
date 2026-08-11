<?php
/**
 * Autonomous success-audit fail-closed unit tests (no WordPress database).
 *
 * @package WPChatGPTPublisher
 */

use PHPUnit\Framework\TestCase;

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}
if ( ! function_exists( 'wp_json_encode' ) ) {
	/** Minimal test double for WordPress's JSON encoder (honors options like wp_json_encode). */
	function wp_json_encode( $value, int $options = 0, int $depth = 512 ): string|false {
		return json_encode( $value, $options, $depth );
	}
}
if ( ! function_exists( '__' ) ) {
	/** Minimal test double for WordPress's translation function. */
	function __( string $text, string $domain = 'default' ): string {
		return $text;
	}
}
if ( ! function_exists( 'sanitize_key' ) ) {
	/** Minimal test double for WordPress's key sanitizer. */
	function sanitize_key( string $key ): string {
		return strtolower( preg_replace( '/[^a-z0-9_\-]/', '', $key ) );
	}
}
if ( ! function_exists( 'sanitize_text_field' ) ) {
	/** Minimal test double for WordPress's scalar sanitizer. */
	function sanitize_text_field( string $value ): string {
		return trim( strip_tags( $value ) );
	}
}
if ( ! function_exists( 'sanitize_textarea_field' ) ) {
	/** Minimal test double for WordPress's textarea sanitizer. */
	function sanitize_textarea_field( string $value ): string {
		return trim( strip_tags( $value ) );
	}
}
if ( ! function_exists( 'sanitize_title' ) ) {
	/** Minimal test double for WordPress's slug sanitizer. */
	function sanitize_title( string $value ): string {
		return strtolower( preg_replace( '/[^a-z0-9_\-]/', '-', $value ) );
	}
}
if ( ! function_exists( 'wp_kses_post' ) ) {
	/** Minimal test double for WordPress's post-content sanitizer. */
	function wp_kses_post( string $value ): string {
		return $value;
	}
}
if ( ! function_exists( 'get_current_user_id' ) ) {
	/** Test-controlled current user id. */
	function get_current_user_id(): int {
		return 1;
	}
}
if ( ! function_exists( 'absint' ) ) {
	/** Minimal test double for WordPress's absolute-integer helper. */
	function absint( $value ): int {
		return abs( (int) $value );
	}
}
if ( ! function_exists( 'get_user_by' ) ) {
	/** No extra author in the test environment. */
	function get_user_by( string $field, $value ) {
		return false;
	}
}
if ( ! function_exists( 'current_user_can' ) ) {
	/** Test-controlled capability check. */
	function current_user_can( string $capability, ...$args ): bool {
		return true;
	}
}
if ( ! function_exists( 'wp_attachment_is_image' ) ) {
	/** No media in the test environment. */
	function wp_attachment_is_image( $attachment ): bool {
		return false;
	}
}
if ( ! function_exists( 'wp_timezone_string' ) ) {
	/** Test-controlled site timezone. */
	function wp_timezone_string(): string {
		return 'UTC';
	}
}
if ( ! function_exists( 'wp_insert_post' ) ) {
	/** Test double that records the insert and returns a fixed post id. */
	function wp_insert_post( array $post, bool $wp_error = false ) {
		$GLOBALS['wpcp_inserted_posts'][] = $post;
		return 123;
	}
}
if ( ! function_exists( 'wp_set_post_categories' ) ) {
	/** No-op test double. */
	function wp_set_post_categories( int $post_id, array $categories, bool $append = false ): void {}
}
if ( ! function_exists( 'wp_set_post_tags' ) ) {
	/** No-op test double. */
	function wp_set_post_tags( int $post_id, $tags, bool $append = false ): void {}
}
if ( ! function_exists( 'set_post_thumbnail' ) ) {
	/** No-op test double. */
	function set_post_thumbnail( int $post_id, int $thumbnail_id ): bool {
		return true;
	}
}
if ( ! function_exists( 'get_post' ) ) {
	/** Test double returning a fixed post object. */
	function get_post( $post = null, string $output = 'OBJECT', string $filter = 'raw' ) {
		$p                = new WP_Post();
		$p->ID            = 123;
		$p->post_type     = 'post';
		$p->post_status   = 'draft';
		$p->post_modified = '2026-08-10 12:00:00';
		$p->post_modified_gmt = '2026-08-10 12:00:00';
		$p->post_content  = 'Body';
		return $p;
	}
}
if ( ! function_exists( 'get_preview_post_link' ) ) {
	/** Minimal test double for the preview link helper. */
	function get_preview_post_link( $post, array $query_args = array(), bool $preview_link = false ): string {
		return 'https://example.test/?preview=true&p=' . ( $post->ID ?? 0 );
	}
}
if ( ! function_exists( 'get_edit_post_link' ) ) {
	/** Minimal test double for the edit link helper. */
	function get_edit_post_link( $id = 0, string $context = 'display' ): string {
		return 'https://example.test/wp-admin/post.php?post=' . (int) $id . '&action=edit';
	}
}
if ( ! function_exists( 'rest_ensure_response' ) ) {
	/** Test double wrapping arrays in a minimal WP_REST_Response. */
	function rest_ensure_response( $response ) {
		return $response instanceof WP_REST_Response ? $response : new WP_REST_Response( $response );
	}
}
if ( ! function_exists( 'get_post_types' ) ) {
	/** Test double exposing only the built-in post type. */
	function get_post_types( array $args = array(), string $output = 'names' ) {
		return array( (object) array( 'name' => 'post', 'public' => true, 'show_in_rest' => true ) );
	}
}
if ( ! function_exists( 'post_type_supports' ) ) {
	/** Test double: post supports the editor. */
	function post_type_supports( string $post_type, string $feature ): bool {
		return 'editor' === $feature;
	}
}
if ( ! function_exists( 'wp_get_post_revisions' ) ) {
	/** Test double: no revisions exist. */
	function wp_get_post_revisions( int $post_id, array $args = array() ) {
		return array();
	}
}
if ( ! function_exists( 'wp_delete_post' ) ) {
	/** Test double that records the rollback call. */
	function wp_delete_post( int $post_id, bool $force = false ) {
		$GLOBALS['wpcp_deleted_posts'][] = array( $post_id, $force );
		return true;
	}
}
if ( ! function_exists( 'is_wp_error' ) ) {
	/** Minimal test double for WordPress's error predicate. */
	function is_wp_error( $thing ): bool {
		return $thing instanceof WP_Error;
	}
}
if ( ! function_exists( 'wp_generate_uuid4' ) ) {
	/** Test-controlled UUID. */
	function wp_generate_uuid4(): string {
		return '550e8400-e29b-41d4-a716-446655440000';
	}
}
if ( ! function_exists( 'current_time' ) ) {
	/** Test-controlled time. */
	function current_time( string $type, bool $gmt = false ) {
		return '2026-08-10 12:00:00';
	}
}
if ( ! function_exists( 'wp_salt' ) ) {
	/** Test-controlled HMAC salt. */
	function wp_salt( string $scheme = 'auth' ): string {
		return 'test-salt';
	}
}
if ( ! function_exists( 'wp_is_uuid' ) ) {
	/** Test double: never recognizes a UUID so request ids are generated. */
	function wp_is_uuid( $uuid ): bool {
		return false;
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
if ( ! class_exists( 'WP_Post' ) ) {
	/** Minimal test double for WordPress's post object. */
	class WP_Post {
		/** @var int */
		public $ID = 0;
		/** @var string */
		public $post_type = 'post';
		/** @var string */
		public $post_status = 'draft';
		/** @var string */
		public $post_modified_gmt = '';
		/** @var string */
		public $post_content = '';
	}
}
if ( ! class_exists( 'WP_REST_Controller' ) ) {
	/** Minimal test double for WordPress's REST base controller. */
	class WP_REST_Controller {}
}
if ( ! class_exists( 'WP_REST_Request' ) ) {
	/** Minimal test double for WordPress's REST request. */
	class WP_REST_Request {
		/** @var array<string,mixed> */
		private array $attributes = array();
		/** @var array<string,string> */
		private array $headers = array();
		/** @param array<string,mixed> $attributes */
		public function __construct( array $attributes = array(), array $headers = array() ) {
			$this->attributes = $attributes;
			$this->headers    = $headers;
		}
		/** @return array<string,mixed> */
		public function get_attributes(): array {
			return $this->attributes;
		}
		/** @return string */
		public function get_header( string $name ) {
			return $this->headers[ $name ] ?? '';
		}
	}
}
if ( ! class_exists( 'WP_REST_Response' ) ) {
	/** Minimal test double for WordPress's REST response. */
	class WP_REST_Response {
		/** @var mixed */
		private $data;
		public function __construct( $data = null ) {
			$this->data = $data;
		}
		/** @return mixed */
		public function get_data() {
			return $this->data;
		}
	}
}

require_once dirname( __DIR__, 2 ) . '/wordpress/editorial-publisher-for-chatgpt/includes/class-wpcp-autonomous.php';
require_once dirname( __DIR__, 2 ) . '/wordpress/editorial-publisher-for-chatgpt/includes/class-wpcp-audit.php';
require_once dirname( __DIR__, 2 ) . '/wordpress/editorial-publisher-for-chatgpt/includes/class-wpcp-auth.php';
require_once dirname( __DIR__, 2 ) . '/wordpress/editorial-publisher-for-chatgpt/includes/class-wpcp-db.php';
require_once dirname( __DIR__, 2 ) . '/wordpress/editorial-publisher-for-chatgpt/includes/class-wpcp-rest-controller.php';

/**
 * Tests the fail-closed success audit contract in autonomous_create()
 * (ADR 0006 §6): when the success audit cannot be durably recorded, the
 * mutation must be rolled back and the request must NOT report success.
 */
final class AutonomousAuditFailClosedTest extends TestCase {
	/** @var array<string,mixed> */
	private array $manifest;

	protected function setUp(): void {
		$GLOBALS['wpcp_inserted_posts'] = array();
		$GLOBALS['wpcp_deleted_posts']  = array();
		$GLOBALS['wpcp_test_options']   = array();
		$GLOBALS['wpdb'] = new class() {
			/** @var string */
			public $prefix = 'wp_';
			/** @var bool */
			public $insert_succeeds = true;
			public function prepare( string $query, ...$args ): string {
				return $query;
			}
			public function get_var( ...$args ) {
				return null;
			}
			public function insert( ...$args ) {
				return $this->insert_succeeds ? 1 : false;
			}
			public function get_charset_collate(): string {
				return 'DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci';
			}
		};
		$this->manifest = array(
			'schemaVersion'   => 1,
			'pipelineId'      => 'trt-news',
			'pipelineVersion' => '1.2.0',
			'requestId'       => '550e8400-e29b-41d4-a716-446655440000',
			'intent'          => 'create_draft',
			'content'         => array(
				'postType'   => 'post',
				'title'      => 'Test draft',
				'body'       => 'Body text',
				'bodyFormat' => 'html',
				'categories' => array(),
				'tags'       => array(),
			),
			'attestations' => array(
				'research' => array( 'performedAt' => '2026-08-10T00:00:00Z', 'sourceCount' => 1, 'sources' => array() ),
				'qa'       => array( 'performedAt' => '2026-08-10T00:00:00Z', 'passed' => true, 'checks' => array() ),
			),
		);
	}

	/**
	 * @param bool $audit_insert_succeeds Whether WPCP_Audit::record() can persist.
	 */
	private function run_create( bool $audit_insert_succeeds ) {
		$GLOBALS['wpdb']->insert_succeeds = $audit_insert_succeeds;
		$request   = new WP_REST_Request(
			array( 'wpcp_connection' => array( 'id' => 'conn-1', 'user_id' => 1 ) ),
			array( 'x-wpcp-request-id' => '550e8400-e29b-41d4-a716-446655440000' )
		);
		$controller = new WPCP_REST_Controller();
		$method     = new ReflectionMethod( WPCP_REST_Controller::class, 'autonomous_create' );
		$method->setAccessible( true );
		return $method->invoke( $controller, $request, $this->manifest, str_repeat( 'a', 64 ) );
	}

	/** When WPCP_Audit::record() throws, the request must NOT report success. */
	public function test_audit_failure_fails_closed_without_success_response(): void {
		$result = $this->run_create( false );

		self::assertInstanceOf( WP_Error::class, $result );
		self::assertSame( 'wpcp_audit_failed', $result->get_error_code() );
		self::assertIsArray( $result->data );
		self::assertSame( 500, $result->data['status'] );
		self::assertNotInstanceOf( WP_REST_Response::class, $result );
	}

	/** The mutation created by the failed execution is rolled back. */
	public function test_audit_failure_rolls_back_the_created_post(): void {
		$this->run_create( false );

		self::assertCount( 1, $GLOBALS['wpcp_inserted_posts'] );
		self::assertSame( array( array( 123, true ) ), $GLOBALS['wpcp_deleted_posts'] );
	}

	/** When the success audit records, the happy path still returns success. */
	public function test_successful_audit_still_returns_success_response(): void {
		$result = $this->run_create( true );

		self::assertNotInstanceOf( WP_Error::class, $result );
		self::assertInstanceOf( WP_REST_Response::class, $result );
		$data = $result->get_data();
		self::assertIsArray( $data );
		self::assertSame( '550e8400-e29b-41d4-a716-446655440000', $data['auditEventId'] );
		self::assertSame( 123, $data['object']['id'] );
		self::assertSame( array(), $GLOBALS['wpcp_deleted_posts'] );
	}
}
