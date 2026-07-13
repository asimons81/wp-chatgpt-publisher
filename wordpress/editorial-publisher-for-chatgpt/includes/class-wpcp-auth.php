<?php
/**
 * Bearer credential authentication.
 *
 * @package WPChatGPTPublisher
 */

defined( 'ABSPATH' ) || exit;

/**
 * Authenticates connection bearer credentials and enforces scope intersections.
 */
final class WPCP_Auth {
	/**
	 * Validate and normalize an MCP service URL.
	 *
	 * Public HTTPS is mandatory outside local development. Local environments may
	 * use a private HTTP endpoint so the documented disposable stack can complete
	 * the real approval flow without weakening production validation.
	 *
	 * @param string $value Candidate service URL.
	 * @return string|false Normalized URL or false when unsafe.
	 */
	public static function service_url( string $value ): string|false {
		$url   = untrailingslashit( esc_url_raw( $value ) );
		$parts = wp_parse_url( $url );
		if (
			! is_array( $parts ) ||
			empty( $parts['host'] ) ||
			empty( $parts['scheme'] ) ||
			! in_array( $parts['scheme'], array( 'http', 'https' ), true ) ||
			isset( $parts['user'] ) ||
			isset( $parts['pass'] )
		) {
			return false;
		}
		$local = in_array( wp_get_environment_type(), array( 'local', 'development' ), true );
		if ( $local ) {
			return $url;
		}
		return 'https' === $parts['scheme'] && wp_http_validate_url( $url ) ? $url : false;
	}

	/**
	 * Send a safe request to an already validated service URL.
	 *
	 * The scoped host filter exists only for local/development environments,
	 * where WordPress otherwise rejects the private endpoint used by the
	 * disposable integration stack. It is removed immediately after the call.
	 *
	 * @param string              $url    Validated service endpoint.
	 * @param array<string,mixed> $args   WordPress HTTP API arguments.
	 * @param string              $method HTTP method.
	 * @return array<string,mixed>|WP_Error
	 */
	public static function service_request( string $url, array $args, string $method = 'GET' ): array|WP_Error {
		$local      = in_array( wp_get_environment_type(), array( 'local', 'development' ), true );
		$host       = wp_parse_url( $url, PHP_URL_HOST );
		$port       = wp_parse_url( $url, PHP_URL_PORT );
		$allow      = static function ( bool $external, string $candidate ) use ( $host ): bool {
			return $external || ( is_string( $host ) && hash_equals( strtolower( $host ), strtolower( $candidate ) ) );
		};
		$allow_port = static function ( array $ports ) use ( $port ): array {
			if ( is_int( $port ) ) {
				$ports[] = $port;
			}
			return array_values( array_unique( $ports ) );
		};
		if ( $local ) {
			add_filter( 'http_request_host_is_external', $allow, 10, 2 );
			add_filter( 'http_allowed_safe_ports', $allow_port );
		}
		try {
			$args['method'] = $method;
			return wp_safe_remote_request( $url, $args );
		} finally {
			if ( $local ) {
				remove_filter( 'http_request_host_is_external', $allow, 10 );
				remove_filter( 'http_allowed_safe_ports', $allow_port );
			}
		}
	}

	/**
	 * Return the keyed hash used for credential lookup.
	 *
	 * @param string $token Connection credential.
	 */
	public static function token_hash( string $token ): string {
		return hash_hmac( 'sha256', $token, wp_salt( 'auth' ) ); }
	/**
	 * Authenticate and authorize a plugin REST request.
	 *
	 * @param WP_REST_Request $request         REST request.
	 * @param array<string>   $required_scopes Required connection scopes.
	 * @param array<string>   $capabilities    Additional native capabilities.
	 * @return true|WP_Error
	 */
	public static function permission( WP_REST_Request $request, array $required_scopes, array $capabilities = array() ) {
		$header = $request->get_header( 'authorization' );
		if ( ! preg_match( '/^Bearer\s+([A-Za-z0-9._~-]{32,512})$/', $header, $matches ) ) {
			return new WP_Error(
				'wpcp_auth_required',
				__( 'A valid WordPress connection credential is required.', 'editorial-publisher-for-chatgpt' ),
				array(
					'status'      => 401,
					'remediation' => __( 'Reconnect this site from ChatGPT.', 'editorial-publisher-for-chatgpt' ),
				)
			); }
		global $wpdb;
		$table = WPCP_DB::table( 'connections' );
		$hash  = self::token_hash( $matches[1] );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Authentication must use current plugin-owned authorization state.
		$connection = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM %i WHERE token_hash = %s AND revoked_at IS NULL', $table, $hash ), ARRAY_A );
		if ( ! $connection ) {
			return new WP_Error(
				'wpcp_connection_expired',
				__( 'This WordPress connection is revoked or expired.', 'editorial-publisher-for-chatgpt' ),
				array(
					'status'      => 401,
					'remediation' => __( 'Reconnect this site from ChatGPT.', 'editorial-publisher-for-chatgpt' ),
				)
			); }
		$scopes = json_decode( (string) $connection['scopes'], true );
		if ( ! is_array( $scopes ) || ! WPCP_Scopes::has( $scopes, $required_scopes ) ) {
			return new WP_Error(
				'wpcp_scope_missing',
				__( 'The connection does not approve the required permission.', 'editorial-publisher-for-chatgpt' ),
				array(
					'status'      => 403,
					'remediation' => __( 'Edit the connection permissions in WordPress, then reconnect.', 'editorial-publisher-for-chatgpt' ),
				)
			); }
		$user_id = (int) $connection['user_id'];
		wp_set_current_user( $user_id );
		foreach ( array_merge( array_map( array( 'WPCP_Scopes', 'capability_for_scope' ), $required_scopes ), $capabilities ) as $capability ) {
			if ( ! current_user_can( $capability ) ) {
				return new WP_Error(
					'wpcp_capability_missing',
					__( 'The connected WordPress user no longer has the required capability.', 'editorial-publisher-for-chatgpt' ),
					array(
						'status'      => 403,
						'remediation' => __( 'Ask a site administrator to review this user role or approve a different user.', 'editorial-publisher-for-chatgpt' ),
					)
				); }
		}
		$wpdb->update( $table, array( 'last_used_at' => current_time( 'mysql', true ) ), array( 'id' => $connection['id'] ), array( '%s' ), array( '%s' ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Records current use in the plugin-owned connection table.
		$attributes                    = $request->get_attributes();
		$attributes['wpcp_connection'] = $connection;
		$request->set_attributes( $attributes );
		return true;
	}
	/**
	 * Return the authenticated connection attached to a request.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return array<string,mixed>
	 */
	public static function connection( WP_REST_Request $request ): array {
		$attributes = $request->get_attributes();
		$value      = $attributes['wpcp_connection'] ?? null;
		return is_array( $value ) ? $value : array(); }
}
