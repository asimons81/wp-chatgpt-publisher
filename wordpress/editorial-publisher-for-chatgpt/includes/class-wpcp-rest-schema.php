<?php
/**
 * REST argument schemas shared by the plugin endpoints.
 *
 * @package WPChatGPTPublisher
 */

defined( 'ABSPATH' ) || exit;

/**
 * Defines and validates the public REST request contract.
 */
final class WPCP_REST_Schema {
	/**
	 * Return registered arguments for a controller callback.
	 *
	 * @param string $callback Controller callback name.
	 * @return array<string,array<string,mixed>>
	 */
	public static function for_callback( string $callback ): array {
		$id          = array(
			'type'    => 'integer',
			'minimum' => 1,
		);
		$uuid        = array(
			'type'   => 'string',
			'format' => 'uuid',
		);
		$version     = array(
			'type'      => 'string',
			'minLength' => 1,
			'maxLength' => 200,
		);
		$taxonomy    = array(
			'type'      => 'string',
			'pattern'   => '^[a-z0-9_-]+$',
			'maxLength' => 100,
		);
		$post_type   = array(
			'type'      => 'string',
			'pattern'   => '^[a-z0-9_-]+$',
			'maxLength' => 100,
		);
		$id_list     = array(
			'type'     => 'array',
			'items'    => $id,
			'maxItems' => 100,
		);
		$idempotency = $uuid + array( 'required' => true );
		$content_id  = $id + array( 'required' => true );
		$expected    = $version + array( 'required' => true );
		$seo         = self::seo_schema();
		$draft_patch = array(
			'id'              => $id + array( 'required' => true ),
			'expectedVersion' => $expected,
			'title'           => array(
				'type'      => 'string',
				'minLength' => 1,
				'maxLength' => 500,
			),
			'content'         => array(
				'type'      => 'string',
				'maxLength' => 1000000,
			),
			'contentFormat'   => array(
				'type' => 'string',
				'enum' => array( 'markdown', 'html', 'blocks' ),
			),
			'excerpt'         => array(
				'type'      => 'string',
				'maxLength' => 10000,
			),
			'slug'            => array(
				'type'      => 'string',
				'pattern'   => '^[a-z0-9-]*$',
				'maxLength' => 200,
			),
			'categories'      => $id_list,
			'tags'            => $id_list,
			'featuredMediaId' => array(
				'type'    => array( 'integer', 'null' ),
				'minimum' => 1,
			),
			'seo'             => $seo,
			'idempotencyKey'  => $idempotency,
		);

		return match ( $callback ) {
			'discovery', 'site', 'diagnostic' => array(),
			'exchange' => array(
				'grant'       => array(
					'type'      => 'string',
					'required'  => true,
					'minLength' => 32,
					'maxLength' => 512,
				),
				'flow_id'     => $uuid + array( 'required' => true ),
				'service_url' => array(
					'type'      => 'string',
					'required'  => true,
					'format'    => 'uri',
					'maxLength' => 2048,
				),
			),
			'search_content' => array(
				'query'     => array(
					'type'      => 'string',
					'default'   => '',
					'maxLength' => 500,
				),
				'postTypes' => array(
					'type'     => 'array',
					'default'  => array( 'post', 'page' ),
					'items'    => $post_type,
					'maxItems' => 10,
				),
				'statuses'  => array(
					'type'     => 'array',
					'default'  => array( 'publish', 'draft' ),
					'items'    => array(
						'type' => 'string',
						'enum' => array( 'draft', 'pending', 'private', 'publish', 'future' ),
					),
					'maxItems' => 5,
				),
				'author'    => $id,
				'category'  => $id,
				'tag'       => $id,
				'after'     => array(
					'type'   => 'string',
					'format' => 'date-time',
				),
				'before'    => array(
					'type'   => 'string',
					'format' => 'date-time',
				),
				'sort'      => array(
					'type'    => 'string',
					'default' => 'relevance',
					'enum'    => array( 'relevance', 'modified_desc', 'modified_asc', 'date_desc', 'date_asc' ),
				),
				'pageSize'  => array(
					'type'    => 'integer',
					'default' => 10,
					'minimum' => 1,
					'maximum' => 50,
				),
				'cursor'    => array(
					'type'      => 'string',
					'maxLength' => 500,
				),
				'detail'    => array(
					'type'    => 'string',
					'default' => 'standard',
					'enum'    => array( 'minimal', 'standard' ),
				),
			),
			'list_drafts' => array(
				'postTypes' => array(
					'type'     => 'array',
					'default'  => array( 'post', 'page' ),
					'items'    => $post_type,
					'maxItems' => 10,
				),
				'author'    => $id,
				'pageSize'  => array(
					'type'    => 'integer',
					'default' => 10,
					'minimum' => 1,
					'maximum' => 50,
				),
				'cursor'    => array(
					'type'      => 'string',
					'maxLength' => 500,
				),
			),
			'get_content' => array(
				'id'             => $id + array( 'required' => true ),
				'fields'         => array(
					'type'     => 'array',
					'items'    => array(
						'type' => 'string',
						'enum' => array( 'title', 'content', 'excerpt', 'author', 'taxonomies', 'seo', 'media', 'dates', 'links' ),
					),
					'maxItems' => 9,
				),
				'representation' => array(
					'type'    => 'string',
					'default' => 'markdown',
					'enum'    => array( 'markdown', 'html', 'raw', 'blocks' ),
				),
				'revisionId'     => $id,
			),
			'revisions' => array(
				'id'          => $id + array( 'required' => true ),
				'includeDiff' => array(
					'type'    => 'boolean',
					'default' => true,
				),
				'pageSize'    => array(
					'type'    => 'integer',
					'default' => 10,
					'minimum' => 1,
					'maximum' => 25,
				),
				'cursor'      => array(
					'type'      => 'string',
					'maxLength' => 500,
				),
			),
			'create_draft' => array(
				'postType'        => $post_type + array( 'default' => 'post' ),
				'title'           => array(
					'type'      => 'string',
					'required'  => true,
					'minLength' => 1,
					'maxLength' => 500,
				),
				'content'         => array(
					'type'      => 'string',
					'required'  => true,
					'maxLength' => 1000000,
				),
				'contentFormat'   => array(
					'type'    => 'string',
					'default' => 'markdown',
					'enum'    => array( 'markdown', 'html', 'blocks' ),
				),
				'excerpt'         => array(
					'type'      => 'string',
					'maxLength' => 10000,
				),
				'slug'            => array(
					'type'      => 'string',
					'pattern'   => '^[a-z0-9-]*$',
					'maxLength' => 200,
				),
				'author'          => $id,
				'categories'      => $id_list + array( 'default' => array() ),
				'tags'            => $id_list + array( 'default' => array() ),
				'featuredMediaId' => $id,
				'seo'             => $seo,
				'idempotencyKey'  => $idempotency,
			),
			'update_draft' => $draft_patch,
			'update_published' => $draft_patch + array(
				'confirmationToken' => array(
					'type'      => 'string',
					'required'  => true,
					'minLength' => 1,
					'maxLength' => 2000,
				),
			),
			'taxonomies' => array( 'postType' => $post_type ),
			'terms' => array(
				'taxonomy' => $taxonomy + array( 'required' => true ),
				'query'    => array(
					'type'      => 'string',
					'default'   => '',
					'maxLength' => 200,
				),
				'pageSize' => array(
					'type'    => 'integer',
					'default' => 25,
					'minimum' => 1,
					'maximum' => 100,
				),
				'cursor'   => array(
					'type'      => 'string',
					'maxLength' => 500,
				),
			),
			'assign_terms' => array(
				'contentId'       => $content_id,
				'taxonomy'        => $taxonomy + array( 'required' => true ),
				'termIds'         => $id_list + array( 'required' => true ),
				'expectedVersion' => $expected,
				'idempotencyKey'  => $idempotency,
			),
			'search_media' => array(
				'query'    => array(
					'type'      => 'string',
					'default'   => '',
					'maxLength' => 300,
				),
				'mimeType' => array(
					'type' => 'string',
					'enum' => array( 'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif' ),
				),
				'pageSize' => array(
					'type'    => 'integer',
					'default' => 12,
					'minimum' => 1,
					'maximum' => 50,
				),
				'cursor'   => array(
					'type'      => 'string',
					'maxLength' => 500,
				),
			),
			'upload_media' => array(
				'sourceUrl'      => array(
					'type'      => 'string',
					'format'    => 'uri',
					'maxLength' => 4096,
				),
				'fileName'       => array(
					'type'      => 'string',
					'minLength' => 1,
					'maxLength' => 240,
				),
				'fileSha256'     => array(
					'type'      => 'string',
					'pattern'   => '^[a-f0-9]{64}$',
					'maxLength' => 64,
				),
				'title'          => array(
					'type'      => 'string',
					'maxLength' => 500,
				),
				'caption'        => array(
					'type'      => 'string',
					'maxLength' => 10000,
				),
				'description'    => array(
					'type'      => 'string',
					'maxLength' => 20000,
				),
				'altText'        => array(
					'type'      => 'string',
					'maxLength' => 2000,
				),
				'idempotencyKey' => $idempotency,
			),
			'update_media' => array(
				'mediaId'        => $id + array( 'required' => true ),
				'title'          => array(
					'type'      => 'string',
					'maxLength' => 500,
				),
				'caption'        => array(
					'type'      => 'string',
					'maxLength' => 10000,
				),
				'description'    => array(
					'type'      => 'string',
					'maxLength' => 20000,
				),
				'altText'        => array(
					'type'      => 'string',
					'maxLength' => 2000,
				),
				'idempotencyKey' => $idempotency,
			),
			'featured_media' => array(
				'contentId'         => $content_id,
				'mediaId'           => array(
					'type'     => array( 'integer', 'null' ),
					'minimum'  => 1,
					'required' => true,
				),
				'expectedVersion'   => $expected,
				'confirmationToken' => array(
					'type'      => 'string',
					'maxLength' => 2000,
				),
				'idempotencyKey'    => $idempotency,
			),
			'get_seo', 'preview' => array( 'contentId' => $content_id ),
			'set_seo' => array(
				'contentId'       => $content_id,
				'expectedVersion' => $expected,
				'metadata'        => $seo + array( 'required' => true ),
				'idempotencyKey'  => $idempotency,
			),
			'schedule' => array(
				'contentId'         => $content_id,
				'publishAt'         => array(
					'type'     => 'string',
					'required' => true,
					'format'   => 'date-time',
				),
				'siteTimezone'      => array(
					'type'      => 'string',
					'required'  => true,
					'minLength' => 1,
					'maxLength' => 100,
				),
				'expectedVersion'   => $expected,
				'confirmationToken' => array(
					'type'      => 'string',
					'required'  => true,
					'minLength' => 1,
					'maxLength' => 2000,
				),
				'idempotencyKey'    => $idempotency,
			),
			'publish' => array(
				'contentId'         => $content_id,
				'expectedVersion'   => $expected,
				'confirmationToken' => array(
					'type'      => 'string',
					'required'  => true,
					'minLength' => 1,
					'maxLength' => 2000,
				),
				'idempotencyKey'    => $idempotency,
			),
			default => array(),
		};
	}

	/**
	 * Reject unknown JSON keys before a route executes.
	 *
	 * @param WP_REST_Request $request  REST request.
	 * @param string          $callback Controller callback name.
	 * @return true|WP_Error
	 */
	public static function validate_known_arguments( WP_REST_Request $request, string $callback ) {
		$json = $request->get_json_params();
		if ( ! is_array( $json ) ) {
			return true;
		}
		$unknown = array_diff( array_keys( $json ), array_keys( self::for_callback( $callback ) ) );
		if ( $unknown ) {
			return new WP_Error(
				'wpcp_unknown_argument',
				sprintf(
					/* translators: %s is a comma-separated list of unknown JSON fields. */
					__( 'Unknown request field(s): %s.', 'editorial-publisher-for-chatgpt' ),
					implode( ', ', array_map( 'sanitize_key', $unknown ) )
				),
				array( 'status' => 400 )
			);
		}
		return true;
	}

	/**
	 * Return the normalized SEO metadata object schema.
	 *
	 * @return array<string,mixed>
	 */
	private static function seo_schema(): array {
		return array(
			'type'                 => 'object',
			'additionalProperties' => false,
			'properties'           => array(
				'title'             => array(
					'type'      => 'string',
					'maxLength' => 300,
				),
				'description'       => array(
					'type'      => 'string',
					'maxLength' => 500,
				),
				'focusKeyword'      => array(
					'type'      => 'string',
					'maxLength' => 200,
				),
				'canonicalUrl'      => array(
					'type'   => 'string',
					'format' => 'uri',
				),
				'socialTitle'       => array(
					'type'      => 'string',
					'maxLength' => 300,
				),
				'socialDescription' => array(
					'type'      => 'string',
					'maxLength' => 500,
				),
				'socialImageId'     => array(
					'type'    => 'integer',
					'minimum' => 1,
				),
				'robots'            => array(
					'type' => 'string',
					'enum' => array( 'index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow' ),
				),
			),
		);
	}
}
