<?php
/**
 * Uninstall Editorial Publisher for ChatGPT.
 *
 * @package WPChatGPTPublisher
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;
if ( ! defined( 'WPCP_REMOVE_DATA_ON_UNINSTALL' ) || true !== WPCP_REMOVE_DATA_ON_UNINSTALL ) {
	return; }
global $wpdb;
foreach ( array( 'connections', 'grants', 'audit', 'idempotency' ) as $wpcp_suffix ) {
	$wpcp_table = $wpdb->prefix . 'wpcp_' . $wpcp_suffix;
	$wpdb->query( $wpdb->prepare( 'DROP TABLE IF EXISTS %i', $wpcp_table ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.DirectDatabaseQuery.SchemaChange -- Explicit opt-in uninstall removes plugin-owned tables.
}
delete_option( 'wpcp_schema_version' );
delete_option( 'wpcp_remove_data_on_uninstall' );
