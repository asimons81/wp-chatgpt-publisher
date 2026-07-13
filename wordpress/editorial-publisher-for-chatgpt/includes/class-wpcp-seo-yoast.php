<?php
/**
 * Yoast SEO adapter.
 *
 * @package WPChatGPTPublisher
 */

defined( 'ABSPATH' ) || exit;
/** Isolates the documented Yoast-compatible post-meta boundary. */
final class WPCP_SEO_Yoast extends WPCP_SEO_Meta_Adapter {
	/**
	 * Yoast normalized metadata keys.
	 *
	 * @var array<string,string>
	 */
	protected array $keys = array(
		'title'             => '_yoast_wpseo_title',
		'description'       => '_yoast_wpseo_metadesc',
		'focusKeyword'      => '_yoast_wpseo_focuskw',
		'canonicalUrl'      => '_yoast_wpseo_canonical',
		'socialTitle'       => '_yoast_wpseo_opengraph-title',
		'socialDescription' => '_yoast_wpseo_opengraph-description',
		'socialImageId'     => '_yoast_wpseo_opengraph-image-id',
	);
	/** {@inheritDoc} */
	public function name(): string {
		return 'yoast'; }
}
