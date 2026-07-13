<?php
/**
 * Tamper-evident audit chain.
 *
 * @package WPChatGPTPublisher
 */

defined( 'ABSPATH' ) || exit;

/**
 * Records a keyed, tamper-evident chain of write metadata.
 */
final class WPCP_Audit {
	/**
	 * Record a remote write event.
	 *
	 * @param array<string,mixed> $connection       Authenticated connection.
	 * @param string              $action           Stable action identifier.
	 * @param string              $object_type      WordPress object type.
	 * @param int|null            $object_id        WordPress object ID.
	 * @param array<string>       $fields           Changed field names.
	 * @param int|null            $previous_revision Previous revision ID.
	 * @param int|null            $new_revision     New revision ID.
	 * @param string              $outcome          Event outcome.
	 * @param string              $request_id       Correlation UUID.
	 * @throws RuntimeException When the event cannot be serialized or persisted.
	 */
	public static function record( array $connection, string $action, string $object_type, ?int $object_id, array $fields, ?int $previous_revision, ?int $new_revision, string $outcome, string $request_id ): string {
		global $wpdb;
		$table = WPCP_DB::table( 'audit' );
		$id    = wp_generate_uuid4();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- The tamper-evident chain must use the latest persisted plugin event.
		$previous_hash = (string) $wpdb->get_var( $wpdb->prepare( 'SELECT event_hash FROM %i ORDER BY created_at DESC, id DESC LIMIT 1', $table ) );
		$event         = array(
			'id'                => $id,
			'connection_id'     => (string) ( $connection['id'] ?? '' ),
			'user_id'           => (int) ( $connection['user_id'] ?? 0 ),
			'action'            => $action,
			'object_type'       => $object_type,
			'object_id'         => $object_id,
			'changed_fields'    => array_values( array_map( 'sanitize_key', $fields ) ),
			'previous_revision' => $previous_revision,
			'new_revision'      => $new_revision,
			'outcome'           => $outcome,
			'request_id'        => $request_id,
			'previous_hash'     => $previous_hash,
			'created_at'        => current_time( 'mysql', true ),
		);
		$encoded_event = wp_json_encode( $event );
		if ( false === $encoded_event ) {
			throw new RuntimeException( 'Audit event serialization failed.' );
		}
		$event_hash = hash_hmac( 'sha256', $encoded_event, wp_salt( 'secure_auth' ) );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery -- Persists security metadata in the plugin-owned audit table.
		$inserted = $wpdb->insert(
			$table,
			array(
				'id'                => $id,
				'connection_id'     => $event['connection_id'],
				'user_id'           => $event['user_id'],
				'action'            => $action,
				'object_type'       => $object_type,
				'object_id'         => $object_id,
				'changed_fields'    => wp_json_encode( $event['changed_fields'] ),
				'previous_revision' => $previous_revision,
				'new_revision'      => $new_revision,
				'outcome'           => $outcome,
				'request_id'        => $request_id,
				'previous_hash'     => $previous_hash,
				'event_hash'        => $event_hash,
				'created_at'        => $event['created_at'],
			),
			array( '%s', '%s', '%d', '%s', '%s', '%d', '%s', '%d', '%d', '%s', '%s', '%s', '%s', '%s' )
		);
		if ( false === $inserted ) {
			throw new RuntimeException( 'Audit event persistence failed.' );
		}
		return $id;
	}
	/**
	 * Return a validated request correlation UUID.
	 *
	 * @param WP_REST_Request $request REST request.
	 */
	public static function request_id( WP_REST_Request $request ): string {
		$value = $request->get_header( 'x-wpcp-request-id' );
		return wp_is_uuid( $value ) ? $value : wp_generate_uuid4(); }
}
