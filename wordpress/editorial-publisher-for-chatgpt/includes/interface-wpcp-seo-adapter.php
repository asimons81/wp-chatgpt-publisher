<?php
/**
 * Normalized SEO adapter contract.
 *
 * @package WPChatGPTPublisher
 */

defined( 'ABSPATH' ) || exit;

/**
 * Provides normalized SEO reads, writes, and capability metadata.
 */
interface WPCP_SEO_Adapter {
	/** Return the adapter identifier. */
	public function name(): string;

	/**
	 * Return normalized metadata.
	 *
	 * @param int $post_id Post ID.
	 * @return array<string,mixed> Normalized metadata response.
	 */
	public function get( int $post_id ): array;

	/**
	 * Set supported normalized metadata.
	 *
	 * @param int                 $post_id  Post ID.
	 * @param array<string,mixed> $metadata Normalized metadata.
	 * @return array<string,mixed> Normalized write response.
	 */
	public function set( int $post_id, array $metadata ): array;

	/**
	 * Return field support metadata.
	 *
	 * @return array<string,bool> Field support map.
	 */
	public function support(): array;
}
