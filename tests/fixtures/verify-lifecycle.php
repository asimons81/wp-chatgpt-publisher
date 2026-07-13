<?php
/**
 * Verify upgrade, deactivation, and opt-in uninstall behavior in disposable WordPress.
 *
 * @package WPChatGPTPublisher
 */

if ( ! defined( 'WP_CLI' ) || ! WP_CLI ) {
	exit( "WP-CLI only\n" );
}
if ( ! in_array( wp_get_environment_type(), array( 'local', 'development' ), true ) ) {
	WP_CLI::error( 'Refusing to run lifecycle checks outside a disposable environment.' );
}

$action = getenv( 'WPCP_LIFECYCLE_ACTION' ) ?: 'upgrade';
$tables = array( 'connections', 'grants', 'audit', 'idempotency' );

if ( 'upgrade' === $action ) {
	global $wpdb;
	$connections = WPCP_DB::table( 'connections' );
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Disposable lifecycle verification reads plugin-owned data directly.
	$before = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM %i', $connections ) );
	update_option( 'wpcp_schema_version', '0.9.0', false );
	WPCP_DB::maybe_upgrade();
	if ( WPCP_DB::SCHEMA_VERSION !== get_option( 'wpcp_schema_version' ) ) {
		WP_CLI::error( 'The schema version did not advance during the upgrade check.' );
	}
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Disposable lifecycle verification reads plugin-owned data directly.
	$after = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM %i', $connections ) );
	if ( $before !== $after ) {
		WP_CLI::error( 'The idempotent schema upgrade changed existing connection data.' );
	}
	WPCP_DB::deactivate();
	if ( wp_next_scheduled( 'wpcp_daily_cleanup' ) ) {
		WP_CLI::error( 'Deactivation did not unschedule retention cleanup.' );
	}
	if ( $connections !== $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $connections ) ) ) {
		WP_CLI::error( 'Deactivation removed persistent plugin data.' );
	}
	WPCP_DB::activate();
	if ( ! wp_next_scheduled( 'wpcp_daily_cleanup' ) ) {
		WP_CLI::error( 'Reactivation did not restore retention cleanup.' );
	}
	WP_CLI::success( 'Upgrade and deactivation behavior verified.' );
	return;
}

define( 'WP_UNINSTALL_PLUGIN', true );
if ( 'remove' === $action ) {
	define( 'WPCP_REMOVE_DATA_ON_UNINSTALL', true );
}
require WP_PLUGIN_DIR . '/editorial-publisher-for-chatgpt/uninstall.php';

global $wpdb;
foreach ( $tables as $suffix ) {
	$table  = WPCP_DB::table( $suffix );
	$exists = $table === $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) );
	if ( 'preserve' === $action && ! $exists ) {
		WP_CLI::error( 'Default uninstall removed data without administrator opt-in.' );
	}
	if ( 'remove' === $action && $exists ) {
		WP_CLI::error( 'Opt-in uninstall did not remove every plugin-owned table.' );
	}
}
if ( 'remove' === $action && false !== get_option( 'wpcp_schema_version', false ) ) {
	WP_CLI::error( 'Opt-in uninstall did not remove the schema option.' );
}
WP_CLI::success( sprintf( 'Uninstall %s behavior verified.', $action ) );
