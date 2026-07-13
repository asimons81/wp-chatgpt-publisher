<?php
/**
 * Post-meta SEO adapter foundation.
 *
 * @package WPChatGPTPublisher
 */

defined( 'ABSPATH' ) || exit;

/**
 * Implements normalized SEO operations for isolated post-meta adapters.
 */
abstract class WPCP_SEO_Meta_Adapter implements WPCP_SEO_Adapter {
	/**
	 * Normalized field to post-meta key map.
	 *
	 * @var array<string,string>
	 */
	protected array $keys = array();

	/**
	 * Read supported normalized metadata.
	 *
	 * @param int $post_id Post ID.
	 * @return array<string,mixed>
	 */
	public function get( int $post_id ): array {
		$output = array();
		foreach ( $this->keys as $normalized => $key ) {
			$value = get_post_meta( $post_id, $key, true );
			if ( '' !== $value ) {
				$output[ $normalized ] = $value;
			}
		}
		return array(
			'provider' => $this->name(),
			'metadata' => $output,
			'support'  => $this->support(),
		);
	}

	/**
	 * Set supported normalized metadata.
	 *
	 * @param int                 $post_id  Post ID.
	 * @param array<string,mixed> $metadata Normalized metadata.
	 * @return array<string,mixed>
	 */
	public function set( int $post_id, array $metadata ): array {
		$changed = array();
		foreach ( $this->keys as $normalized => $key ) {
			if ( array_key_exists( $normalized, $metadata ) ) {
				update_post_meta( $post_id, $key, $this->sanitize_value( $normalized, $metadata[ $normalized ] ) );
				$changed[] = $normalized;
			}
		}
		return array(
			'provider'       => $this->name(),
			'changed_fields' => $changed,
			'support'        => $this->support(),
			'warnings'       => array_values( array_map( static fn( string $field ): string => sprintf( 'The active SEO adapter does not support %s.', $field ), array_diff( array_keys( $metadata ), array_keys( $this->keys ) ) ) ),
		);
	}

	/** {@inheritDoc} */
	public function support(): array {
		$all = array( 'title', 'description', 'focusKeyword', 'canonicalUrl', 'socialTitle', 'socialDescription', 'socialImageId', 'robots' );
		return array_fill_keys( $all, false ) + array_fill_keys( array_keys( $this->keys ), true );
	}

	/**
	 * Sanitize a normalized SEO field by context.
	 *
	 * @param string $field Normalized field name.
	 * @param mixed  $value Raw field value.
	 * @return int|string
	 */
	private function sanitize_value( string $field, $value ) {
		if ( 'canonicalUrl' === $field ) {
			return esc_url_raw( (string) $value );
		}
		if ( 'socialImageId' === $field ) {
			return absint( $value );
		}
		if ( 'robots' === $field ) {
			$allowed = array( 'index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow' );
			return in_array( $value, $allowed, true ) ? (string) $value : 'index,follow';
		}
		return sanitize_text_field( (string) $value );
	}
}
