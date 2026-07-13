<?php
/**
 * AIOSEO compatibility adapter.
 *
 * @package WPChatGPTPublisher
 */

defined( 'ABSPATH' ) || exit;
/** Reports AIOSEO detection without writing undocumented private storage. */
final class WPCP_SEO_AIOSEO implements WPCP_SEO_Adapter {
	/** {@inheritDoc} */
	public function name(): string {
		return 'aioseo'; }
	/**
	 * Return the intentionally unsupported AIOSEO read result.
	 *
	 * @param int $post_id Post ID.
	 * @return array<string,mixed>
	 */
	public function get( int $post_id ): array {
		unset( $post_id );
		return array(
			'provider' => $this->name(),
			'metadata' => array(),
			'support'  => $this->support(),
			'warnings' => array( 'AIOSEO was detected, but v1 does not read or write private storage without a stable public adapter API.' ),
		);
	}
	/**
	 * Return the intentionally unsupported AIOSEO write result.
	 *
	 * @param int                 $post_id  Post ID.
	 * @param array<string,mixed> $metadata Normalized metadata.
	 * @return array<string,mixed>
	 */
	public function set( int $post_id, array $metadata ): array {
		unset( $post_id, $metadata );
		return array(
			'provider'       => $this->name(),
			'changed_fields' => array(),
			'support'        => $this->support(),
			'warnings'       => array( 'AIOSEO metadata is unavailable in v1 because no stable public write API was confirmed.' ),
		);
	}
	/** {@inheritDoc} */
	public function support(): array {
		return array_fill_keys( array( 'title', 'description', 'focusKeyword', 'canonicalUrl', 'socialTitle', 'socialDescription', 'socialImageId', 'robots' ), false );
	}
}
