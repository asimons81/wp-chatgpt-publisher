<?php
/**
 * Native fallback SEO adapter.
 *
 * @package WPChatGPTPublisher
 */

defined( 'ABSPATH' ) || exit;
/** Stores normalized SEO fields in plugin-owned post meta. */
final class WPCP_SEO_Native extends WPCP_SEO_Meta_Adapter {
	/**
	 * Plugin-owned normalized metadata keys.
	 *
	 * @var array<string,string>
	 */
	protected array $keys = array(
		'title'             => '_wpcp_seo_title',
		'description'       => '_wpcp_seo_description',
		'focusKeyword'      => '_wpcp_focus_keyword',
		'canonicalUrl'      => '_wpcp_canonical_url',
		'socialTitle'       => '_wpcp_social_title',
		'socialDescription' => '_wpcp_social_description',
		'socialImageId'     => '_wpcp_social_image_id',
		'robots'            => '_wpcp_robots',
	);
	/** {@inheritDoc} */
	public function name(): string {
		return 'native'; }
}
