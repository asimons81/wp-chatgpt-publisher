<?php
/**
 * Scope and capability policy.
 *
 * @package WPChatGPTPublisher
 */

defined( 'ABSPATH' ) || exit;

/**
 * Defines the stable connection scopes and capability intersection policy.
 */
final class WPCP_Scopes {
	public const ALL       = array( 'site:read', 'content:read', 'drafts:read', 'drafts:write', 'media:read', 'media:write', 'taxonomy:read', 'taxonomy:write', 'seo:read', 'seo:write', 'published:edit', 'publish:schedule', 'publish:execute', 'audit:read' );
	public const READ_ONLY = array( 'site:read', 'content:read', 'drafts:read', 'media:read', 'taxonomy:read', 'seo:read' );
	public const EDITORIAL = array( 'site:read', 'content:read', 'drafts:read', 'drafts:write', 'media:read', 'media:write', 'taxonomy:read', 'taxonomy:write', 'seo:read', 'seo:write' );
	public const PUBLISHER = self::ALL;
	/**
	 * Sanitize and allowlist a scope collection.
	 *
	 * @param array<mixed> $scopes Raw scope values.
	 * @return list<string>
	 */
	public static function sanitize( array $scopes ): array {
		$scalar_scopes = array_filter( $scopes, 'is_scalar' );
		$sanitized     = array_map( static fn( $scope ): string => sanitize_text_field( (string) $scope ), $scalar_scopes );
		return array_values( array_unique( array_intersect( $sanitized, self::ALL ) ) ); }
	/**
	 * Test whether every required scope is granted.
	 *
	 * @param array<string> $granted  Granted scopes.
	 * @param array<string> $required Required scopes.
	 */
	public static function has( array $granted, array $required ): bool {
		return empty( array_diff( $required, $granted ) ); }
	/**
	 * Return the baseline native capability for a scope.
	 *
	 * @param string $scope Connection scope.
	 */
	public static function capability_for_scope( string $scope ): string {
		return match ( $scope ) {
			'site:read', 'content:read', 'drafts:read', 'media:read', 'taxonomy:read', 'seo:read', 'audit:read' => 'read',
			'drafts:write', 'seo:write' => 'edit_posts',
			'media:write' => 'upload_files',
			'taxonomy:write' => 'edit_categories',
			'published:edit' => 'edit_published_posts',
			'publish:schedule', 'publish:execute' => 'publish_posts',
			default => 'do_not_allow',
		};
	}
	/**
	 * Test whether a user currently satisfies each scope baseline.
	 *
	 * @param int           $user_id WordPress user ID.
	 * @param array<string> $scopes  Requested scopes.
	 */
	public static function user_can_scopes( int $user_id, array $scopes ): bool {
		$user = get_user_by( 'id', $user_id );
		if ( ! $user ) {
			return false; }
		foreach ( $scopes as $scope ) {
			if ( ! user_can( $user, self::capability_for_scope( $scope ) ) ) {
				return false; }
		}
		return true;
	}
}
