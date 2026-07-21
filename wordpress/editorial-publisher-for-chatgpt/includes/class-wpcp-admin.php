<?php
/**
 * Conventional WordPress admin experience.
 *
 * @package WPChatGPTPublisher
 */

defined( 'ABSPATH' ) || exit;


/** Provides the plugin's WordPress administration screens and actions. */
final class WPCP_Admin {
	/** Register admin hooks. */
	public function register(): void {
		add_action( 'admin_menu', array( $this, 'menu' ) );
		add_action( 'admin_init', array( $this, 'process_approval' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'assets' ) );
		add_action( 'admin_post_wpcp_revoke', array( $this, 'revoke' ) );
		add_action( 'admin_post_wpcp_update_scopes', array( $this, 'update_scopes' ) );
		add_action( 'admin_post_wpcp_export_audit', array( $this, 'export_audit' ) ); }
	/** Register the plugin's administration menu. */
	public function menu(): void {
		add_menu_page( __( 'Editorial Publisher for ChatGPT', 'editorial-publisher-for-chatgpt' ), __( 'Editorial Publisher', 'editorial-publisher-for-chatgpt' ), 'manage_options', 'wpcp', array( $this, 'overview' ), 'dashicons-edit-page', 58 );
		add_submenu_page( 'wpcp', __( 'Connections', 'editorial-publisher-for-chatgpt' ), __( 'Connections', 'editorial-publisher-for-chatgpt' ), 'manage_options', 'wpcp-connections', array( $this, 'connections' ) );
		add_submenu_page( 'wpcp', __( 'Permissions', 'editorial-publisher-for-chatgpt' ), __( 'Permissions', 'editorial-publisher-for-chatgpt' ), 'manage_options', 'wpcp-permissions', array( $this, 'permissions' ) );
		add_submenu_page( 'wpcp', __( 'Audit log', 'editorial-publisher-for-chatgpt' ), __( 'Audit log', 'editorial-publisher-for-chatgpt' ), 'manage_options', 'wpcp-audit', array( $this, 'audit' ) );
		add_submenu_page( 'wpcp', __( 'Diagnostics', 'editorial-publisher-for-chatgpt' ), __( 'Diagnostics', 'editorial-publisher-for-chatgpt' ), 'manage_options', 'wpcp-diagnostics', array( $this, 'diagnostics' ) );
		add_submenu_page( 'options.php', __( 'Approve ChatGPT connection', 'editorial-publisher-for-chatgpt' ), __( 'Approve connection', 'editorial-publisher-for-chatgpt' ), 'read', 'wpcp-approve', array( $this, 'approve' ) );
	}
	/**
	 * Enqueue assets only on plugin-owned screens.
	 *
	 * @param string $hook Current admin page hook.
	 */
	public function assets( string $hook ): void {
		if ( str_contains( $hook, 'wpcp' ) ) {
			wp_enqueue_style( 'wpcp-admin', plugins_url( 'assets/admin.css', WPCP_FILE ), array(), WPCP_VERSION ); } }
	/**
	 * Render a consistent page header.
	 *
	 * @param string $title       Page title.
	 * @param string $description Introductory copy.
	 */
	private function header( string $title, string $description ): void {
		echo '<div class="wrap wpcp-wrap"><h1>' . esc_html( $title ) . '</h1><p class="wpcp-lead">' . esc_html( $description ) . '</p>'; }
	/** Render the closing page wrapper. */
	private function footer(): void {
		echo '</div>'; }
	/** Render the plugin overview screen. */
	public function overview(): void {
		$this->require_admin();
		global $wpdb;
		$connections = WPCP_DB::table( 'connections' );
		$audit       = WPCP_DB::table( 'audit' );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Security status must reflect the current plugin-owned connection table.
		$active = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM %i WHERE revoked_at IS NULL', $connections ) );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Audit status must reflect the current plugin-owned audit table.
		$last = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM %i ORDER BY created_at DESC LIMIT 1', $audit ), ARRAY_A );
		$this->header( __( 'Editorial Publisher for ChatGPT', 'editorial-publisher-for-chatgpt' ), __( 'A secure bridge between ChatGPT and this site’s editorial workflow.', 'editorial-publisher-for-chatgpt' ) );
		echo '<div class="wpcp-grid"><section class="wpcp-card"><span class="wpcp-kicker">' . esc_html__( 'Connection status', 'editorial-publisher-for-chatgpt' ) . '</span><strong class="wpcp-metric">' . esc_html( (string) $active ) . '</strong><p>' . esc_html__( 'active ChatGPT connections', 'editorial-publisher-for-chatgpt' ) . '</p><a class="button" href="' . esc_url( admin_url( 'admin.php?page=wpcp-connections' ) ) . '">' . esc_html__( 'Manage connections', 'editorial-publisher-for-chatgpt' ) . '</a></section>';
		echo '<section class="wpcp-card"><span class="wpcp-kicker">' . esc_html__( 'Compatibility', 'editorial-publisher-for-chatgpt' ) . '</span><h2>' . esc_html( get_bloginfo( 'version' ) ) . ' / PHP ' . esc_html( PHP_VERSION ) . '</h2><p>' . esc_html( function_exists( 'wp_register_ability' ) ? __( 'Abilities API integration is available.', 'editorial-publisher-for-chatgpt' ) : __( 'REST compatibility mode is active.', 'editorial-publisher-for-chatgpt' ) ) . '</p><a class="button" href="' . esc_url( admin_url( 'admin.php?page=wpcp-diagnostics' ) ) . '">' . esc_html__( 'Run diagnostics', 'editorial-publisher-for-chatgpt' ) . '</a></section>';
		echo '<section class="wpcp-card wpcp-card--wide"><span class="wpcp-kicker">' . esc_html__( 'Recent write activity', 'editorial-publisher-for-chatgpt' ) . '</span>';
		if ( $last ) {
			/* translators: 1: outcome, 2: content type, 3: content ID, 4: UTC timestamp. */
			echo '<h2>' . esc_html( (string) $last['action'] ) . '</h2><p>' . esc_html( sprintf( __( '%1$s on %2$s #%3$d at %4$s UTC.', 'editorial-publisher-for-chatgpt' ), $last['outcome'], $last['object_type'], (int) $last['object_id'], $last['created_at'] ) ) . '</p>';
		} else {
			echo '<p>' . esc_html__( 'No ChatGPT write activity has been recorded.', 'editorial-publisher-for-chatgpt' ) . '</p>';
		} echo '</section></div>';
		echo '<div class="notice notice-info inline"><p><strong>' . esc_html__( 'Privacy by default:', 'editorial-publisher-for-chatgpt' ) . '</strong> ' . esc_html__( 'The plugin audit log stores metadata and field names, never article bodies, prompts, files, passwords, or authorization headers.', 'editorial-publisher-for-chatgpt' ) . '</p></div>';
		$this->footer();
	}
	/** Render active and revoked connections. */
	public function connections(): void {
		$this->require_admin();
		global $wpdb;
		$table = WPCP_DB::table( 'connections' );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Connection management must not show cached authorization state.
		$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM %i ORDER BY created_at DESC', $table ), ARRAY_A );
		$this->header( __( 'Connections', 'editorial-publisher-for-chatgpt' ), __( 'Review, limit, or revoke every ChatGPT connection to this site.', 'editorial-publisher-for-chatgpt' ) );
		echo '<div class="wpcp-stack">';
		if ( ! $rows ) {
			echo '<div class="wpcp-empty"><h2>' . esc_html__( 'No connections yet', 'editorial-publisher-for-chatgpt' ) . '</h2><p>' . esc_html__( 'Start the connection from Editorial Publisher for ChatGPT.', 'editorial-publisher-for-chatgpt' ) . '</p></div>'; }
		foreach ( $rows as $row ) {
			$user    = get_user_by( 'id', (int) $row['user_id'] );
			$revoked = ! empty( $row['revoked_at'] );
			echo '<section class="wpcp-card wpcp-connection"><div><span class="wpcp-status ' . ( $revoked ? 'is-revoked' : 'is-active' ) . '">' . esc_html( $revoked ? __( 'Revoked', 'editorial-publisher-for-chatgpt' ) : __( 'Active', 'editorial-publisher-for-chatgpt' ) ) . '</span><h2>' . esc_html( $row['friendly_name'] ) . '</h2><p>' . esc_html( $user ? $user->display_name : __( 'Deleted user', 'editorial-publisher-for-chatgpt' ) ) . ' · ' . esc_html( $row['created_at'] ) . ' UTC</p><p class="description">' . esc_html( $row['service_url'] ) . '</p><div class="wpcp-scopes">';
			foreach ( (array) json_decode( (string) $row['scopes'], true ) as $scope ) {
				echo '<code>' . esc_html( $scope ) . '</code>';
			} echo '</div></div><div class="wpcp-actions">';
			if ( ! $revoked ) {
				$url = wp_nonce_url( admin_url( 'admin-post.php?action=wpcp_revoke&id=' . rawurlencode( $row['id'] ) ), 'wpcp_revoke_' . $row['id'] );
				echo '<a class="button button-link-delete" href="' . esc_url( $url ) . '">' . esc_html__( 'Revoke', 'editorial-publisher-for-chatgpt' ) . '</a><a class="button" href="' . esc_url( admin_url( 'admin.php?page=wpcp-permissions&id=' . rawurlencode( $row['id'] ) ) ) . '">' . esc_html__( 'Edit permissions', 'editorial-publisher-for-chatgpt' ) . '</a>';
			} echo '</div></section>';
		} echo '</div>';
		$this->footer(); }
	/** Render permission profiles and per-connection editing. */
	public function permissions(): void {
		$this->require_admin();
		global $wpdb;
		$table = WPCP_DB::table( 'connections' );
		$id    = isset( $_GET['id'] ) ? sanitize_text_field( wp_unslash( $_GET['id'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Connection permissions are current security state.
		$row = $id ? $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM %i WHERE id = %s AND revoked_at IS NULL', $table, $id ), ARRAY_A ) : null;
		$this->header( __( 'Permission profiles', 'editorial-publisher-for-chatgpt' ), __( 'Connections never elevate the approving WordPress user. Consequential actions still require confirmation in ChatGPT.', 'editorial-publisher-for-chatgpt' ) );
		echo '<div class="wpcp-grid"><section class="wpcp-card"><h2>' . esc_html__( 'Read Only', 'editorial-publisher-for-chatgpt' ) . '</h2><p>' . esc_html__( 'Read site, content, drafts, media, taxonomy, and SEO metadata. No writes.', 'editorial-publisher-for-chatgpt' ) . '</p></section><section class="wpcp-card"><h2>' . esc_html__( 'Editorial', 'editorial-publisher-for-chatgpt' ) . '</h2><p>' . esc_html__( 'Create and update drafts, upload media, assign taxonomy, and manage supported SEO. No publishing.', 'editorial-publisher-for-chatgpt' ) . '</p></section><section class="wpcp-card"><h2>' . esc_html__( 'Publisher', 'editorial-publisher-for-chatgpt' ) . '</h2><p>' . esc_html__( 'Editorial access plus published edits, scheduling, and publishing after confirmation.', 'editorial-publisher-for-chatgpt' ) . '</p></section></div>';
		if ( $row ) {
			$granted = (array) json_decode( (string) $row['scopes'], true );
			echo '<form class="wpcp-card wpcp-form" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '" method="post"><input type="hidden" name="action" value="wpcp_update_scopes"><input type="hidden" name="id" value="' . esc_attr( $row['id'] ) . '">';
			wp_nonce_field( 'wpcp_update_scopes_' . $row['id'] );
			/* translators: %s: connection friendly name. */
			echo '<h2>' . esc_html( sprintf( __( 'Custom permissions for %s', 'editorial-publisher-for-chatgpt' ), $row['friendly_name'] ) ) . '</h2><div class="wpcp-checks">';
			foreach ( WPCP_Scopes::ALL as $scope ) {
				echo '<label><input type="checkbox" name="scopes[]" value="' . esc_attr( $scope ) . '" ' . checked( in_array( $scope, $granted, true ), true, false ) . '> <code>' . esc_html( $scope ) . '</code></label>';
			} echo '</div><button class="button button-primary" type="submit">' . esc_html__( 'Save permissions and revoke active tokens', 'editorial-publisher-for-chatgpt' ) . '</button><p class="description">' . esc_html__( 'For safety, changing permissions revokes this connection. Reconnect from ChatGPT to approve the new scope set.', 'editorial-publisher-for-chatgpt' ) . '</p></form>'; }
		$this->footer(); }
	/** Render the recent tamper-evident audit log. */
	public function audit(): void {
		$this->require_admin();
		global $wpdb;
		$table = WPCP_DB::table( 'audit' );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Administrators require the latest plugin-owned audit records.
		$rows = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM %i ORDER BY created_at DESC LIMIT 100', $table ), ARRAY_A );
		$this->header( __( 'Audit log', 'editorial-publisher-for-chatgpt' ), __( 'Tamper-evident metadata for remote editorial activity. Article bodies and credentials are never recorded.', 'editorial-publisher-for-chatgpt' ) );
		echo '<p><a class="button" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=wpcp_export_audit&format=csv' ), 'wpcp_export_audit' ) ) . '">' . esc_html__( 'Export CSV', 'editorial-publisher-for-chatgpt' ) . '</a> <a class="button" href="' . esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=wpcp_export_audit&format=json' ), 'wpcp_export_audit' ) ) . '">' . esc_html__( 'Export JSON', 'editorial-publisher-for-chatgpt' ) . '</a></p><div class="wpcp-table-wrap"><table class="widefat striped"><thead><tr><th>' . esc_html__( 'Date UTC', 'editorial-publisher-for-chatgpt' ) . '</th><th>' . esc_html__( 'Action', 'editorial-publisher-for-chatgpt' ) . '</th><th>' . esc_html__( 'Object', 'editorial-publisher-for-chatgpt' ) . '</th><th>' . esc_html__( 'Fields', 'editorial-publisher-for-chatgpt' ) . '</th><th>' . esc_html__( 'Outcome', 'editorial-publisher-for-chatgpt' ) . '</th><th>' . esc_html__( 'Request ID', 'editorial-publisher-for-chatgpt' ) . '</th></tr></thead><tbody>';
		foreach ( $rows as $row ) {
			echo '<tr><td>' . esc_html( $row['created_at'] ) . '</td><td><code>' . esc_html( $row['action'] ) . '</code></td><td>' . esc_html( $row['object_type'] . ' #' . $row['object_id'] ) . '</td><td>' . esc_html( implode( ', ', (array) json_decode( (string) $row['changed_fields'], true ) ) ) . '</td><td>' . esc_html( $row['outcome'] ) . '</td><td><code>' . esc_html( $row['request_id'] ) . '</code></td></tr>';
		} echo '</tbody></table></div>';
		$this->footer(); }
	/** Render non-mutating compatibility diagnostics. */
	public function diagnostics(): void {
		$this->require_admin();
		$checks = array( array( 'HTTPS', is_ssl(), __( 'Configure a valid TLS certificate and correct proxy HTTPS headers.', 'editorial-publisher-for-chatgpt' ) ), array( 'REST API', ! empty( rest_get_server()->get_namespaces() ), __( 'Confirm the REST API is not disabled by a security plugin or host.', 'editorial-publisher-for-chatgpt' ) ), array( 'Pretty permalinks', '' !== (string) get_option( 'permalink_structure' ), __( 'Open Settings → Permalinks and choose a named structure.', 'editorial-publisher-for-chatgpt' ) ), array( 'Application Passwords', wp_is_application_passwords_available(), __( 'This optional compatibility feature may be disabled by policy; the default approval flow does not require it.', 'editorial-publisher-for-chatgpt' ) ), array( 'WordPress 6.9+', version_compare( get_bloginfo( 'version' ), '6.9', '>=' ), __( 'Update WordPress to a supported release.', 'editorial-publisher-for-chatgpt' ) ), array( 'PHP 8.1+', version_compare( PHP_VERSION, '8.1', '>=' ), __( 'Ask the host to use a supported PHP version.', 'editorial-publisher-for-chatgpt' ) ) );
		$this->header( __( 'Diagnostics', 'editorial-publisher-for-chatgpt' ), __( 'Compatibility checks never change site or security-plugin settings automatically.', 'editorial-publisher-for-chatgpt' ) );
		echo '<div class="wpcp-stack">';
		foreach ( $checks as [ $label, $ok, $remediation ] ) {
			$status = (string) ( $ok ? __( 'Pass', 'editorial-publisher-for-chatgpt' ) : __( 'Needs attention', 'editorial-publisher-for-chatgpt' ) );
			$detail = (string) ( $ok ? __( 'This check passed.', 'editorial-publisher-for-chatgpt' ) : $remediation );
			echo '<section class="wpcp-card wpcp-check"><span class="wpcp-status ' . ( $ok ? 'is-active' : 'is-revoked' ) . '">' . esc_html( $status ) . '</span><div><h2>' . esc_html( (string) $label ) . '</h2><p>' . esc_html( $detail ) . '</p></div></section>';
		}
		$maximum_upload = size_format( wp_max_upload_size() );
		if ( false === $maximum_upload ) {
			$maximum_upload = esc_html__( 'Unavailable', 'editorial-publisher-for-chatgpt' );
		}
		echo '<section class="wpcp-card"><h2>' . esc_html__( 'Environment details', 'editorial-publisher-for-chatgpt' ) . '</h2><dl class="wpcp-details"><dt>' . esc_html__( 'Maximum upload', 'editorial-publisher-for-chatgpt' ) . '</dt><dd>' . esc_html( $maximum_upload ) . '</dd><dt>' . esc_html__( 'REST namespace', 'editorial-publisher-for-chatgpt' ) . '</dt><dd><code>wp-chatgpt-publisher/v1</code></dd><dt>' . esc_html__( 'Plugin version', 'editorial-publisher-for-chatgpt' ) . '</dt><dd>' . esc_html( WPCP_VERSION ) . '</dd></dl></section></div>';
		$this->footer(); }
	/** Process a signed approval before WordPress emits admin-page output. */
	public function process_approval(): void {
		$page           = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( $_GET['page'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Routing check only; the signed request and form nonce are validated below.
		$request_method = isset( $_SERVER['REQUEST_METHOD'] ) ? strtoupper( sanitize_text_field( wp_unslash( $_SERVER['REQUEST_METHOD'] ) ) ) : 'GET';
		if ( 'wpcp-approve' !== $page || 'POST' !== $request_method ) {
			return;
		}
		if ( ! is_user_logged_in() ) {
			auth_redirect();
		}
		$request_token = isset( $_POST['request'] ) ? sanitize_text_field( wp_unslash( $_POST['request'] ) ) : '';
		$payload       = $this->decode_request( $request_token );
		if ( is_wp_error( $payload ) ) {
			wp_die( esc_html( $payload->get_error_message() ), esc_html__( 'Invalid connection request', 'editorial-publisher-for-chatgpt' ), array( 'response' => 400 ) );
		}
		check_admin_referer( 'wpcp_approve_' . $payload['flow_id'] );
		$scopes     = WPCP_Scopes::sanitize( explode( ' ', (string) $payload['scope'] ) );
		$allowed    = array_values( array_filter( $scopes, static fn( string $scope ): bool => user_can( get_current_user_id(), WPCP_Scopes::capability_for_scope( $scope ) ) ) );
		$raw_scopes = isset( $_POST['scopes'] ) && is_array( $_POST['scopes'] ) ? array_map( 'sanitize_text_field', wp_unslash( $_POST['scopes'] ) ) : array();
		$selected   = array_values( array_intersect( WPCP_Scopes::sanitize( $raw_scopes ), $allowed ) );
		if ( ! $selected ) {
			wp_die( esc_html__( 'At least one permission is required.', 'editorial-publisher-for-chatgpt' ) );
		}
		$this->create_approval( $payload, $selected );
	}

	/** Render the signed connection-approval screen. */
	public function approve(): void {
		if ( ! is_user_logged_in() ) {
			auth_redirect();
		}
		$request_token = isset( $_GET['request'] ) ? sanitize_text_field( wp_unslash( $_GET['request'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Initial signed approval request is validated remotely before rendering.
		$payload       = $this->decode_request( $request_token );
		if ( is_wp_error( $payload ) ) {
			wp_die( esc_html( $payload->get_error_message() ), esc_html__( 'Invalid connection request', 'editorial-publisher-for-chatgpt' ), array( 'response' => 400 ) );
		} $scopes = WPCP_Scopes::sanitize( explode( ' ', (string) $payload['scope'] ) );
		$allowed  = array_values( array_filter( $scopes, static fn( string $scope ): bool => user_can( get_current_user_id(), WPCP_Scopes::capability_for_scope( $scope ) ) ) );
		$this->header( __( 'Approve ChatGPT connection', 'editorial-publisher-for-chatgpt' ), __( 'Review the exact permissions before connecting. Your WordPress password stays on this site.', 'editorial-publisher-for-chatgpt' ) );
		echo '<form method="post" class="wpcp-card wpcp-form"><input type="hidden" name="request" value="' . esc_attr( $request_token ) . '">';
		wp_nonce_field( 'wpcp_approve_' . $payload['flow_id'] );
		echo '<dl class="wpcp-details"><dt>' . esc_html__( 'Connection service', 'editorial-publisher-for-chatgpt' ) . '</dt><dd>' . esc_html( $payload['service_url'] ) . '</dd><dt>' . esc_html__( 'WordPress user', 'editorial-publisher-for-chatgpt' ) . '</dt><dd>' . esc_html( wp_get_current_user()->display_name ) . '</dd></dl><h2>' . esc_html__( 'Requested permissions', 'editorial-publisher-for-chatgpt' ) . '</h2><div class="wpcp-checks">';
		foreach ( $allowed as $scope ) {
			echo '<label><input type="checkbox" name="scopes[]" value="' . esc_attr( $scope ) . '" checked> <code>' . esc_html( $scope ) . '</code></label>';
		} echo '</div><button class="button button-primary" type="submit">' . esc_html__( 'Approve and return to ChatGPT', 'editorial-publisher-for-chatgpt' ) . '</button><a class="button" href="' . esc_url( admin_url( 'admin.php?page=wpcp' ) ) . '">' . esc_html__( 'Deny', 'editorial-publisher-for-chatgpt' ) . '</a></form>';
		$this->footer(); }
	/**
	 * Persist an approved connection and redirect to the verified service.
	 *
	 * @param array<string,mixed> $payload Verified service claims.
	 * @param array<string>       $scopes  Approved scopes.
	 */
	private function create_approval( array $payload, array $scopes ): never {
		global $wpdb;
		$connections   = WPCP_DB::table( 'connections' );
		$grants        = WPCP_DB::table( 'grants' );
		$connection_id = wp_generate_uuid4();
		$credential    = rtrim( strtr( base64_encode( random_bytes( 48 ) ), '+/', '-_' ), '=' ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- URL-safe encoding of cryptographically random credential bytes.
		$grant         = rtrim( strtr( base64_encode( random_bytes( 32 ) ), '+/', '-_' ), '=' ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- URL-safe encoding of cryptographically random grant bytes.
		$grant_hash    = WPCP_Auth::token_hash( $grant );
		$service       = untrailingslashit( esc_url_raw( (string) $payload['service_url'] ) );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- Persists a newly approved connection in a plugin-owned table.
		$connection_inserted = $wpdb->insert(
			$connections,
			array(
				'id'            => $connection_id,
				'friendly_name' => 'ChatGPT · ' . wp_date( 'M j, Y' ),
				'user_id'       => get_current_user_id(),
				'service_url'   => $service,
				'client_id'     => sanitize_text_field( (string) $payload['flow_id'] ),
				'token_hash'    => WPCP_Auth::token_hash( $credential ),
				'scopes'        => wp_json_encode( $scopes ),
				'created_at'    => current_time( 'mysql', true ),
				'last_used_at'  => null,
				'revoked_at'    => null,
			),
			array( '%s', '%s', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s' )
		);
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- Persists a one-time grant in a plugin-owned table.
		$grant_inserted = $wpdb->insert(
			$grants,
			array(
				'grant_hash'    => $grant_hash,
				'flow_id'       => sanitize_text_field( (string) $payload['flow_id'] ),
				'connection_id' => $connection_id,
				'service_url'   => $service,
				'expires_at'    => gmdate( 'Y-m-d H:i:s', time() + 5 * MINUTE_IN_SECONDS ),
				'consumed_at'   => null,
			),
			array( '%s', '%s', '%s', '%s', '%s', '%s' )
		);
		$transient_set  = set_transient( 'wpcp_grant_' . substr( $grant_hash, 0, 32 ), WPCP_Secret::encrypt( $credential, $connection_id ), 5 * MINUTE_IN_SECONDS );
		if ( false === $connection_inserted || false === $grant_inserted || ! $transient_set ) {
			$wpdb->delete( $grants, array( 'grant_hash' => $grant_hash ), array( '%s' ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Rolls back plugin-owned grant state.
			$wpdb->delete( $connections, array( 'id' => $connection_id ), array( '%s' ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Rolls back plugin-owned connection state.
			wp_die( esc_html__( 'WordPress could not securely persist the connection approval. Please try again.', 'editorial-publisher-for-chatgpt' ), '', array( 'response' => 500 ) );
		}
		$callback = add_query_arg(
			array(
				'flow'  => (string) $payload['flow_id'],
				'grant' => $grant,
			),
			$service . '/connect/callback'
		);
		$this->send_callback_handoff( $callback );
	}

	/**
	 * Return a browser-safe handoff document for a verified OAuth callback.
	 *
	 * The callback URL has already been assembled from a signed service URL and
	 * a one-time WordPress grant. A document handoff avoids dependence on a host
	 * preserving a cross-origin Location header while retaining the exact URL.
	 *
	 * @param string $callback Verified service callback URL.
	 */
	public static function callback_handoff_document( string $callback ): string {
		$url        = esc_url_raw( $callback );
		$javascript = wp_json_encode( $url, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT );
		if ( ! is_string( $javascript ) ) {
			$javascript = '""';
		}
		return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="refresh" content="0;url=' . esc_attr( $url ) . '"><title>' . esc_html__( 'Returning to ChatGPT', 'editorial-publisher-for-chatgpt' ) . '</title></head><body><p>' . esc_html__( 'Returning to ChatGPT…', 'editorial-publisher-for-chatgpt' ) . ' <a href="' . esc_url( $url ) . '">' . esc_html__( 'Continue', 'editorial-publisher-for-chatgpt' ) . '</a></p><script>window.location.replace(' . $javascript . ');</script></body></html>';
	}

	/**
	 * Send the verified callback handoff without relying on an external redirect header.
	 *
	 * @param string $callback Verified service callback URL.
	 */
	private function send_callback_handoff( string $callback ): never {
		status_header( 200 );
		nocache_headers();
		header( 'Referrer-Policy: no-referrer' );
		header( 'X-Robots-Tag: noindex, nofollow', true );
		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- The handoff document escapes every dynamic value before it is returned.
		echo self::callback_handoff_document( $callback );
		exit;
	}
	/**
	 * Verify a signed connection request with its issuing service.
	 *
	 * @param string $token Signed connection request token.
	 * @return array<string,mixed>|WP_Error
	 */
	private function decode_request( string $token ): array|WP_Error {
		$parts = explode( '.', $token );
		if ( 3 !== count( $parts ) ) {
			return new WP_Error( 'wpcp_invalid_request', __( 'The connection request is malformed.', 'editorial-publisher-for-chatgpt' ) );
		}
		$encoded    = strtr( $parts[1], '-_', '+/' );
		$encoded   .= str_repeat( '=', ( 4 - strlen( $encoded ) % 4 ) % 4 );
		$unverified = json_decode( (string) base64_decode( $encoded, true ), true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode -- JWT payload discovery only; signature is verified by the issuing service below.
		if ( ! is_array( $unverified ) || empty( $unverified['service_url'] ) ) {
			return new WP_Error( 'wpcp_invalid_request', __( 'The connection request is incomplete or expired.', 'editorial-publisher-for-chatgpt' ) );
		}
		$service = WPCP_Auth::service_url( (string) $unverified['service_url'] );
		if ( false === $service ) {
			return new WP_Error( 'wpcp_invalid_service', __( 'The connection service URL is not safe.', 'editorial-publisher-for-chatgpt' ) );
		} $metadata = WPCP_Auth::service_request(
			$service . '/.well-known/oauth-protected-resource',
			array(
				'timeout'             => 8,
				'redirection'         => 0,
				'limit_response_size' => 32768,
			)
		);
		if ( is_wp_error( $metadata ) || 200 !== wp_remote_retrieve_response_code( $metadata ) ) {
			return new WP_Error( 'wpcp_service_unavailable', __( 'The connection service metadata could not be verified.', 'editorial-publisher-for-chatgpt' ) );
		} $document = json_decode( wp_remote_retrieve_body( $metadata ), true );
		if ( ! is_array( $document ) || untrailingslashit( (string) ( $document['resource'] ?? '' ) ) !== $service ) {
			return new WP_Error( 'wpcp_service_mismatch', __( 'The connection service metadata does not match the requested service.', 'editorial-publisher-for-chatgpt' ) );
		}
		$validation_body = wp_json_encode( array( 'request' => $token ) );
		if ( false === $validation_body ) {
			return new WP_Error( 'wpcp_invalid_request', __( 'The connection request could not be encoded.', 'editorial-publisher-for-chatgpt' ) );
		}
		$validation = WPCP_Auth::service_request(
			$service . '/connect/validate',
			array(
				'timeout'             => 8,
				'redirection'         => 0,
				'limit_response_size' => 32768,
				'headers'             => array( 'Content-Type' => 'application/json' ),
				'body'                => $validation_body,
			),
			'POST'
		);
		if ( is_wp_error( $validation ) || 200 !== wp_remote_retrieve_response_code( $validation ) ) {
			return new WP_Error( 'wpcp_invalid_signature', __( 'The connection service could not verify this signed request.', 'editorial-publisher-for-chatgpt' ) );
		}
		$payload = json_decode( wp_remote_retrieve_body( $validation ), true );
		$site    = untrailingslashit( home_url( '/' ) );
		if (
			! is_array( $payload ) ||
			empty( $payload['flow_id'] ) ||
			empty( $payload['scope'] ) ||
			empty( $payload['exp'] ) ||
			(int) $payload['exp'] < time() ||
			untrailingslashit( (string) ( $payload['service_url'] ?? '' ) ) !== $service ||
			untrailingslashit( (string) ( $payload['site_url'] ?? '' ) ) !== $site
		) {
			return new WP_Error( 'wpcp_invalid_request', __( 'The verified connection request is incomplete, expired, or intended for another site.', 'editorial-publisher-for-chatgpt' ) );
		}
		$payload['service_url'] = $service;
		return $payload;
	}
	/** Revoke one connection and return to the connection list. */
	public function revoke(): never {
		$this->require_admin();
		$id = isset( $_GET['id'] ) ? sanitize_text_field( wp_unslash( $_GET['id'] ) ) : '';
		check_admin_referer( 'wpcp_revoke_' . $id );
		global $wpdb;
		$wpdb->update( WPCP_DB::table( 'connections' ), array( 'revoked_at' => current_time( 'mysql', true ) ), array( 'id' => $id ), array( '%s' ), array( '%s' ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Explicit administrator revocation of plugin-owned authorization state.
		wp_safe_redirect( admin_url( 'admin.php?page=wpcp-connections' ) );
		exit; }
	/** Save a reduced scope set and revoke the old credential. */
	public function update_scopes(): never {
		$this->require_admin();
		$id = isset( $_POST['id'] ) ? sanitize_text_field( wp_unslash( $_POST['id'] ) ) : '';
		check_admin_referer( 'wpcp_update_scopes_' . $id );
		$raw_scopes = isset( $_POST['scopes'] ) && is_array( $_POST['scopes'] ) ? array_map( 'sanitize_text_field', wp_unslash( $_POST['scopes'] ) ) : array();
		$scopes     = WPCP_Scopes::sanitize( $raw_scopes );
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Updates plugin-owned authorization state after an explicit administrator action.
		$wpdb->update(
			WPCP_DB::table( 'connections' ),
			array(
				'scopes'     => wp_json_encode( $scopes ),
				'revoked_at' => current_time( 'mysql', true ),
			),
			array( 'id' => $id ),
			array( '%s', '%s' ),
			array( '%s' )
		);
		wp_safe_redirect( admin_url( 'admin.php?page=wpcp-connections' ) );
		exit; }
	/** Stream a nonce-protected audit export to the administrator. */
	public function export_audit(): never {
		$this->require_admin();
		check_admin_referer( 'wpcp_export_audit' );
		global $wpdb;
		$table = WPCP_DB::table( 'audit' );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- The export must contain current plugin-owned audit records.
		$rows   = $wpdb->get_results( $wpdb->prepare( 'SELECT id,connection_id,user_id,action,object_type,object_id,changed_fields,previous_revision,new_revision,outcome,request_id,created_at FROM %i ORDER BY created_at DESC LIMIT 10000', $table ), ARRAY_A );
		$format = isset( $_GET['format'] ) && 'csv' === sanitize_key( wp_unslash( $_GET['format'] ) ) ? 'csv' : 'json';
		nocache_headers();
		header( 'Content-Disposition: attachment; filename="wpcp-audit-' . gmdate( 'Y-m-d' ) . '.' . $format . '"' );
		if ( 'json' === $format ) {
			header( 'Content-Type: application/json; charset=utf-8' );
			echo wp_json_encode( $rows, JSON_PRETTY_PRINT );
		} else {
			header( 'Content-Type: text/csv; charset=utf-8' );
			$stream = fopen( 'php://output', 'w' );
			if ( $stream ) {
				if ( $rows ) {
					fputcsv( $stream, array_keys( $rows[0] ) );
					foreach ( $rows as $row ) {
						fputcsv( $stream, $row );
					}
				} fclose( $stream ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose -- Completes a streamed HTTP response, not a stored filesystem write.
			}
		} exit; }
	/** Require the native administrator capability. */
	private function require_admin(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage Editorial Publisher.', 'editorial-publisher-for-chatgpt' ), 403 ); } }
}
