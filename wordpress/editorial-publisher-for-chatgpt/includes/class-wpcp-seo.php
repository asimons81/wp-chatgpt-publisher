<?php
/**
 * SEO adapter selection and native metadata registration.
 *
 * @package WPChatGPTPublisher
 */

defined( 'ABSPATH' ) || exit;
/** Selects the active normalized SEO provider. */
final class WPCP_SEO {
	/** Return the adapter for the active SEO plugin. */
	public static function adapter(): WPCP_SEO_Adapter {
		if ( defined( 'WPSEO_VERSION' ) ) {
			return new WPCP_SEO_Yoast(); }
		if ( defined( 'RANK_MATH_VERSION' ) ) {
			return new WPCP_SEO_RankMath(); }
		if ( defined( 'AIOSEO_VERSION' ) || function_exists( 'aioseo' ) ) {
			return new WPCP_SEO_AIOSEO(); }
		return new WPCP_SEO_Native();
	}
	/** Register plugin-owned native fallback metadata. */
	public static function register_meta(): void {
		foreach ( array( '_wpcp_seo_title', '_wpcp_seo_description', '_wpcp_focus_keyword', '_wpcp_canonical_url', '_wpcp_social_title', '_wpcp_social_description', '_wpcp_social_image_id', '_wpcp_robots' ) as $key ) {
			register_post_meta(
				'',
				$key,
				array(
					'type'              => str_ends_with( $key, '_id' ) ? 'integer' : 'string',
					'single'            => true,
					'show_in_rest'      => false,
					'auth_callback'     => static fn(): bool => current_user_can( 'edit_posts' ),
					'sanitize_callback' => str_ends_with( $key, '_url' ) ? 'esc_url_raw' : 'sanitize_text_field',
				)
			);
		}
	}
}
