<?php
/**
 * Rank Math SEO adapter.
 *
 * @package WPChatGPTPublisher
 */

defined( 'ABSPATH' ) || exit;
/** Isolates the Rank Math post-meta boundary. */
final class WPCP_SEO_RankMath extends WPCP_SEO_Meta_Adapter {
	/**
	 * Rank Math normalized metadata keys.
	 *
	 * @var array<string,string>
	 */
	protected array $keys = array(
		'title'             => 'rank_math_title',
		'description'       => 'rank_math_description',
		'focusKeyword'      => 'rank_math_focus_keyword',
		'canonicalUrl'      => 'rank_math_canonical_url',
		'socialTitle'       => 'rank_math_facebook_title',
		'socialDescription' => 'rank_math_facebook_description',
		'socialImageId'     => 'rank_math_facebook_image_id',
		'robots'            => 'rank_math_robots',
	);
	/** {@inheritDoc} */
	public function name(): string {
		return 'rank-math'; }
}
