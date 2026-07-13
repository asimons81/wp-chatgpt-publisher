<?php
/**
 * Database schema and lifecycle.
 *
 * @package WPChatGPTPublisher
 */

defined( 'ABSPATH' ) || exit;

/**
 * Owns the plugin database schema and scheduled retention cleanup.
 */
final class WPCP_DB {
	public const SCHEMA_VERSION = '1.0.0';

	/**
	 * Return a prefixed plugin table name.
	 *
	 * @param string $name Logical table suffix.
	 */
	public static function table( string $name ): string {
		global $wpdb;
		return $wpdb->prefix . 'wpcp_' . $name; }
	/** Validate compatibility, install tables, and schedule cleanup. */
	public static function activate(): void {
		if ( version_compare( PHP_VERSION, '8.1', '<' ) || version_compare( get_bloginfo( 'version' ), '6.9', '<' ) || ! function_exists( 'sodium_crypto_aead_xchacha20poly1305_ietf_encrypt' ) ) {
			deactivate_plugins( plugin_basename( WPCP_FILE ) );
			wp_die( esc_html__( 'Editorial Publisher for ChatGPT requires WordPress 6.9 or later, PHP 8.1 or later, and the PHP Sodium extension.', 'editorial-publisher-for-chatgpt' ) ); }
		self::install_schema();
		update_option( 'wpcp_schema_version', self::SCHEMA_VERSION, false );
		if ( ! wp_next_scheduled( 'wpcp_daily_cleanup' ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', 'wpcp_daily_cleanup' ); }
	}
	/** Apply idempotent schema changes after an in-place plugin upgrade. */
	public static function maybe_upgrade(): void {
		if ( self::SCHEMA_VERSION === get_option( 'wpcp_schema_version' ) ) {
			return;
		}
		self::install_schema();
		update_option( 'wpcp_schema_version', self::SCHEMA_VERSION, false );
	}
	/** Remove the scheduled cleanup event. */
	public static function deactivate(): void {
		$timestamp = wp_next_scheduled( 'wpcp_daily_cleanup' );
		if ( $timestamp ) {
			wp_unschedule_event( $timestamp, 'wpcp_daily_cleanup' ); } }
	/** Create or upgrade plugin-owned database tables. */
	public static function install_schema(): void {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$charset     = $wpdb->get_charset_collate();
		$connections = self::table( 'connections' );
		$grants      = self::table( 'grants' );
		$audit       = self::table( 'audit' );
		$idempotency = self::table( 'idempotency' );
		dbDelta( "CREATE TABLE $connections (id char(36) NOT NULL, friendly_name varchar(200) NOT NULL, user_id bigint(20) unsigned NOT NULL, service_url varchar(2048) NOT NULL, client_id varchar(200) NOT NULL, token_hash char(64) NOT NULL, scopes longtext NOT NULL, created_at datetime NOT NULL, last_used_at datetime NULL, revoked_at datetime NULL, PRIMARY KEY  (id), UNIQUE KEY token_hash (token_hash), KEY user_id (user_id), KEY revoked_at (revoked_at)) $charset;" );
		dbDelta( "CREATE TABLE $grants (grant_hash char(64) NOT NULL, flow_id char(36) NOT NULL, connection_id char(36) NOT NULL, service_url varchar(2048) NOT NULL, expires_at datetime NOT NULL, consumed_at datetime NULL, PRIMARY KEY  (grant_hash), KEY expires_at (expires_at)) $charset;" );
		dbDelta( "CREATE TABLE $audit (id char(36) NOT NULL, connection_id char(36) NOT NULL, user_id bigint(20) unsigned NOT NULL, action varchar(100) NOT NULL, object_type varchar(50) NOT NULL, object_id bigint(20) unsigned NULL, changed_fields longtext NOT NULL, previous_revision bigint(20) unsigned NULL, new_revision bigint(20) unsigned NULL, outcome varchar(30) NOT NULL, request_id char(36) NOT NULL, previous_hash char(64) NOT NULL, event_hash char(64) NOT NULL, created_at datetime NOT NULL, PRIMARY KEY  (id), KEY connection_id (connection_id), KEY created_at (created_at), KEY object_lookup (object_type,object_id)) $charset;" );
		dbDelta( "CREATE TABLE $idempotency (connection_id char(36) NOT NULL, idempotency_key char(36) NOT NULL, action varchar(100) NOT NULL, request_hash char(64) NOT NULL, response longtext NULL, created_at datetime NOT NULL, PRIMARY KEY  (connection_id,idempotency_key), KEY created_at (created_at)) $charset;" );
	}
	/** Delete expired approval grants and old idempotency records. */
	public static function cleanup(): void {
		global $wpdb;
		$grants      = self::table( 'grants' );
		$idempotency = self::table( 'idempotency' );
		$wpdb->query( $wpdb->prepare( 'DELETE FROM %i WHERE expires_at < %s', $grants, gmdate( 'Y-m-d H:i:s', time() - DAY_IN_SECONDS ) ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Deletes expired plugin-owned grants.
		$wpdb->query( $wpdb->prepare( 'DELETE FROM %i WHERE created_at < %s', $idempotency, gmdate( 'Y-m-d H:i:s', time() - 7 * DAY_IN_SECONDS ) ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Deletes expired plugin-owned idempotency records.
	}
}
