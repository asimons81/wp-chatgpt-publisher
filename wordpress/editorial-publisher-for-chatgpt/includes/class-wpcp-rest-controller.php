<?php
/**
 * Narrow WordPress REST surface.
 *
 * @package WPChatGPTPublisher
 */

defined( 'ABSPATH' ) || exit;

/**
 * Implements the narrow authenticated WordPress REST surface.
 */
final class WPCP_REST_Controller extends WP_REST_Controller {
	/**
	 * REST namespace.
	 *
	 * @var non-falsy-string
	 */
	protected $namespace      = 'wp-chatgpt-publisher/v1';
	private const IMAGE_MIMES = array( 'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif' );
	/** Register all plugin REST routes. */
	public function register_routes(): void {
		register_rest_route(
			$this->namespace,
			'/discovery',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( $this, 'discovery' ),
				'permission_callback' => '__return_true',
			)
		);
		register_rest_route(
			$this->namespace,
			'/connections/exchange',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( $this, 'exchange' ),
				'permission_callback' => static fn( WP_REST_Request $request ) => WPCP_REST_Schema::validate_known_arguments( $request, 'exchange' ),
				'args'                => WPCP_REST_Schema::for_callback( 'exchange' ),
			)
		);
		$this->route( '/site', WP_REST_Server::READABLE, 'site', array( 'site:read' ), array( 'read' ) );
		$this->route( '/diagnostics/connection', WP_REST_Server::READABLE, 'diagnostic', array( 'site:read' ), array( 'read' ) );
		$this->route( '/content/search', WP_REST_Server::CREATABLE, 'search_content', array( 'content:read' ), array( 'read' ) );
		$this->route( '/content/get', WP_REST_Server::CREATABLE, 'get_content', array( 'content:read' ), array( 'read' ) );
		$this->route( '/content/drafts', WP_REST_Server::CREATABLE, 'list_drafts', array( 'drafts:read' ), array( 'read' ) );
		$this->route( '/content/revisions', WP_REST_Server::CREATABLE, 'revisions', array( 'content:read' ), array( 'read' ) );
		$this->route( '/drafts', WP_REST_Server::CREATABLE, 'create_draft', array( 'drafts:write' ), array( 'edit_posts' ) );
		$this->route( '/drafts', WP_REST_Server::EDITABLE, 'update_draft', array( 'drafts:write' ), array( 'edit_posts' ) );
		$this->route( '/published', WP_REST_Server::EDITABLE, 'update_published', array( 'published:edit' ), array( 'edit_published_posts' ) );
		$this->route( '/taxonomies', WP_REST_Server::CREATABLE, 'taxonomies', array( 'taxonomy:read' ), array( 'read' ) );
		$this->route( '/terms', WP_REST_Server::CREATABLE, 'terms', array( 'taxonomy:read' ), array( 'read' ) );
		$this->route( '/terms/assign', WP_REST_Server::CREATABLE, 'assign_terms', array( 'taxonomy:write' ), array( 'edit_posts' ) );
		$this->route( '/media/search', WP_REST_Server::CREATABLE, 'search_media', array( 'media:read' ), array( 'read' ) );
		$this->route( '/media/upload', WP_REST_Server::CREATABLE, 'upload_media', array( 'media:write' ), array( 'upload_files' ) );
		$this->route( '/media', WP_REST_Server::EDITABLE, 'update_media', array( 'media:write' ), array( 'upload_files' ) );
		$this->route( '/media/featured', WP_REST_Server::CREATABLE, 'featured_media', array( 'media:write' ), array( 'edit_posts' ) );
		$this->route( '/seo/get', WP_REST_Server::CREATABLE, 'get_seo', array( 'seo:read' ), array( 'read' ) );
		$this->route( '/seo/set', WP_REST_Server::CREATABLE, 'set_seo', array( 'seo:write' ), array( 'edit_posts' ) );
		$this->route( '/preview', WP_REST_Server::CREATABLE, 'preview', array( 'drafts:read' ), array( 'read' ) );
		$this->route( '/schedule', WP_REST_Server::CREATABLE, 'schedule', array( 'publish:schedule' ), array( 'publish_posts' ) );
		$this->route( '/publish', WP_REST_Server::CREATABLE, 'publish', array( 'publish:execute' ), array( 'publish_posts' ) );
	}
	/**
	 * Register one authenticated endpoint.
	 *
	 * @param non-falsy-string $path         Route path.
	 * @param string           $methods      REST method definition.
	 * @param string           $callback     Controller callback.
	 * @param array<string>    $scopes       Required connection scopes.
	 * @param array<string>    $capabilities Additional native capabilities.
	 */
	private function route( string $path, string $methods, string $callback, array $scopes, array $capabilities ): void {
		$args = WPCP_REST_Schema::for_callback( $callback );
		register_rest_route(
			$this->namespace,
			$path,
			array(
				'methods'             => $methods,
				'callback'            => array( $this, $callback ),
				'permission_callback' => static function ( WP_REST_Request $request ) use ( $scopes, $capabilities, $callback ) {
					$permission = WPCP_Auth::permission( $request, $scopes, $capabilities );
					return true === $permission ? WPCP_REST_Schema::validate_known_arguments( $request, $callback ) : $permission;
				},
				'args'                => $args,
			)
		); }
	/** Return public plugin discovery metadata. */
	public function discovery(): WP_REST_Response {
		return rest_ensure_response(
			array(
				'name'             => 'Editorial Publisher for ChatGPT',
				'version'          => WPCP_VERSION,
				'restNamespace'    => $this->namespace,
				'wordpressVersion' => get_bloginfo( 'version' ),
				'requiresHttps'    => true,
				'abilitiesApi'     => function_exists( 'wp_register_ability' ),
			)
		); }
	/**
	 * Exchange a one-time approval grant for a connection credential.
	 *
	 * @param WP_REST_Request $request REST request.
	 */
	public function exchange( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$service = WPCP_Auth::service_url( (string) $request['service_url'] );
		if ( false === $service ) {
			return new WP_Error( 'wpcp_invalid_service', __( 'The connection service URL is not safe.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 400 ) ); }
		global $wpdb;
		$grants      = WPCP_DB::table( 'grants' );
		$connections = WPCP_DB::table( 'connections' );
		$hash        = WPCP_Auth::token_hash( (string) $request['grant'] );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Grant exchange requires current plugin-owned authorization state.
		$grant = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM %i WHERE grant_hash = %s AND flow_id = %s AND service_url = %s AND consumed_at IS NULL AND expires_at > %s', $grants, $hash, (string) $request['flow_id'], $service, current_time( 'mysql', true ) ), ARRAY_A );
		if ( ! $grant ) {
			return new WP_Error( 'wpcp_invalid_grant', __( 'The connection approval grant is invalid, expired, or already used.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 401 ) ); }
		$wpdb->query( $wpdb->prepare( 'UPDATE %i SET consumed_at = %s WHERE grant_hash = %s AND consumed_at IS NULL', $grants, current_time( 'mysql', true ), $hash ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Atomic one-time consumption of a plugin-owned grant.
		if ( 1 !== $wpdb->rows_affected ) {
			return new WP_Error( 'wpcp_grant_replayed', __( 'The connection approval grant was already used.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 401 ) ); }
		$transient_key = 'wpcp_grant_' . substr( $hash, 0, 32 );
		$ciphertext    = get_transient( $transient_key );
		delete_transient( $transient_key );
		if ( ! is_string( $ciphertext ) ) {
			return new WP_Error( 'wpcp_grant_expired', __( 'The encrypted connection credential expired.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 401 ) ); }
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Exchange must use current plugin-owned connection state.
		$connection = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM %i WHERE id = %s AND revoked_at IS NULL', $connections, $grant['connection_id'] ), ARRAY_A );
		if ( ! $connection ) {
			return new WP_Error( 'wpcp_connection_missing', __( 'The approved connection no longer exists.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 401 ) ); }
		$user = get_user_by( 'id', (int) $connection['user_id'] );
		return rest_ensure_response(
			array(
				'connection_id' => (string) $connection['id'],
				'credential'    => WPCP_Secret::decrypt( $ciphertext, (string) $grant['connection_id'] ),
				'site_name'     => get_bloginfo( 'name' ),
				'user_id'       => (int) $connection['user_id'],
				'user_name'     => $user ? $user->display_name : __( 'WordPress user', 'editorial-publisher-for-chatgpt' ),
				'scopes'        => json_decode( (string) $connection['scopes'], true ),
			)
		);
	}
	/**
	 * Return compact connected-site information.
	 *
	 * @param WP_REST_Request $request REST request.
	 */
	public function site( WP_REST_Request $request ): WP_REST_Response {
		$connection = WPCP_Auth::connection( $request );
		$theme      = wp_get_theme();
		$user       = wp_get_current_user();
		return rest_ensure_response(
			array(
				'siteName'           => get_bloginfo( 'name' ),
				'siteUrl'            => home_url( '/' ),
				'wordpressVersion'   => get_bloginfo( 'version' ),
				'pluginVersion'      => WPCP_VERSION,
				'themeName'          => $theme->get( 'Name' ),
				'seoAdapter'         => WPCP_SEO::adapter()->name(),
				'userDisplayName'    => $user->display_name,
				'scopes'             => json_decode( (string) $connection['scopes'], true ),
				'postTypes'          => array_values( get_post_types( array( 'show_in_rest' => true ), 'names' ) ),
				'taxonomies'         => array_values( get_taxonomies( array( 'show_in_rest' => true ), 'names' ) ),
				'maximumUploadBytes' => wp_max_upload_size(),
				'connectionHealth'   => 'healthy',
			)
		); }
	/** Return the authenticated connection diagnostic. */
	public function diagnostic(): WP_REST_Response {
		return rest_ensure_response(
			array(
				'status'               => 'healthy',
				'restApi'              => true,
				'https'                => is_ssl(),
				'prettyPermalinks'     => '' !== (string) get_option( 'permalink_structure' ),
				'applicationPasswords' => wp_is_application_passwords_available(),
				'maximumUploadBytes'   => wp_max_upload_size(),
				'serverTimeUtc'        => gmdate( DATE_ATOM ),
			)
		); }
	/**
	 * Search compact content summaries.
	 *
	 * @param WP_REST_Request $request REST request.
	 */
	public function search_content( WP_REST_Request $request ): WP_REST_Response {
		return rest_ensure_response( $this->query_content( $request, false ) ); }
	/**
	 * List draft and pending content summaries.
	 *
	 * @param WP_REST_Request $request REST request.
	 */
	public function list_drafts( WP_REST_Request $request ): WP_REST_Response {
		$request->set_param( 'statuses', array( 'draft', 'pending' ) );
		return rest_ensure_response( $this->query_content( $request, true ) ); }
	/**
	 * Query paginated content.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @param bool            $drafts  Whether to force draft statuses.
	 * @return array<string,mixed> Paginated content results.
	 */
	private function query_content( WP_REST_Request $request, bool $drafts ): array {
		$page_size = min( 50, max( 1, (int) ( $request['pageSize'] ? $request['pageSize'] : 10 ) ) );
		$page      = $this->decode_cursor( (string) $request['cursor'] );
		$sort      = sanitize_key( (string) ( $request['sort'] ? $request['sort'] : 'relevance' ) );
		$ordering  = match ( $sort ) {
			'modified_asc' => array( 'modified', 'ASC' ),
			'date_desc' => array( 'date', 'DESC' ),
			'date_asc' => array( 'date', 'ASC' ),
			'relevance' => array( $request['query'] ? 'relevance' : 'modified', 'DESC' ),
			default => array( 'modified', 'DESC' ),
		};
		$args = array(
			's'              => sanitize_text_field( (string) $request['query'] ),
			'post_type'      => $this->allowed_post_types( (array) ( $request['postTypes'] ? $request['postTypes'] : array( 'post', 'page' ) ) ),
			'post_status'    => $drafts ? array( 'draft', 'pending' ) : array_intersect( (array) ( $request['statuses'] ? $request['statuses'] : array( 'publish', 'draft' ) ), array( 'publish', 'draft', 'pending', 'private', 'future' ) ),
			'posts_per_page' => $page_size,
			'paged'          => $page,
			'orderby'        => $ordering[0],
			'order'          => $ordering[1],
			'no_found_rows'  => false,
		);
		if ( $request['author'] ) {
			$args['author'] = absint( $request['author'] );
		}
		if ( $request['category'] ) {
			$args['cat'] = absint( $request['category'] );
		}
		if ( $request['tag'] ) {
			$args['tag_id'] = absint( $request['tag'] );
		}
		if ( $request['after'] || $request['before'] ) {
			$args['date_query'] = array(
				array(
					'after'     => $request['after'] ? (string) $request['after'] : null,
					'before'    => $request['before'] ? (string) $request['before'] : null,
					'inclusive' => true,
				),
			);
		}
		$query = new WP_Query( $args );
		$items = array();
		foreach ( $query->posts as $candidate ) {
			if ( $candidate instanceof WP_Post ) {
				$items[] = $this->summary( $candidate );
			}
		}
		$next = $page < (int) $query->max_num_pages ? $this->encode_cursor( $page + 1 ) : null;
		return array(
			'items'      => $items,
			'pagination' => array(
				'nextCursor' => $next,
				'truncated'  => null !== $next,
				'returned'   => count( $items ),
				'total'      => (int) $query->found_posts,
			),
		);
	}
	/**
	 * Build a compact content summary.
	 *
	 * @param WP_Post $post Content object.
	 * @return array<string,mixed> Compact content summary.
	 */
	private function summary( WP_Post $post ): array {
		$author = get_user_by( 'id', (int) $post->post_author );
		return array(
			'id'         => $post->ID,
			'type'       => $post->post_type,
			'title'      => get_the_title( $post ),
			'status'     => $post->post_status,
			'url'        => 'publish' === $post->post_status ? get_permalink( $post ) : get_preview_post_link( $post ),
			'modified'   => get_post_modified_time( DATE_ATOM, true, $post ),
			'excerpt'    => wp_trim_words( wp_strip_all_tags( get_the_excerpt( $post ) ), 30 ),
			'wordCount'  => str_word_count( wp_strip_all_tags( $post->post_content ) ),
			'author'     => $author ? $author->display_name : '',
			'taxonomies' => $this->taxonomy_summary( $post ),
		); }
	/**
	 * Return one selected content item and requested fields.
	 *
	 * @param WP_REST_Request $request REST request.
	 */
	public function get_content( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$post = get_post( absint( $request['id'] ) );
		if ( ! $post || ! current_user_can( 'read_post', $post->ID ) ) {
			return new WP_Error( 'wpcp_not_found', __( 'The requested content was not found or is not readable.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 404 ) );
		}
		$source = $post;
		if ( $request['revisionId'] ) {
			$revision_id = absint( $request['revisionId'] );
			$revision    = wp_get_post_revision( $revision_id, OBJECT );
			if ( ! $revision instanceof WP_Post || (int) $revision->post_parent !== $post->ID ) {
				return new WP_Error( 'wpcp_revision_not_found', __( 'The requested revision does not belong to this content item.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 404 ) );
			}
			$source = $revision;
		}
		$representation = sanitize_key( (string) ( $request['representation'] ? $request['representation'] : 'markdown' ) );
		$content        = match ( $representation ) {
			'html' => apply_filters( 'the_content', $source->post_content ), // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- Uses the core content rendering filter intentionally.
			'raw', 'blocks' => $source->post_content,
			default => WPCP_Markdown::to_markdown( $source->post_content ),
		};
		$fields   = (array) ( $request['fields'] ? $request['fields'] : array( 'title', 'content', 'excerpt', 'author', 'taxonomies', 'seo', 'media', 'dates', 'links' ) );
		$response = array(
			'id'             => $post->ID,
			'type'           => $post->post_type,
			'status'         => $post->post_status,
			'version'        => $this->version( $post ),
			'representation' => $representation,
			'revisionId'     => $source instanceof WP_Post && 'revision' === $source->post_type ? $source->ID : null,
		);
		if ( in_array( 'title', $fields, true ) ) {
			$response['title'] = get_the_title( $source ); }
		if ( in_array( 'content', $fields, true ) ) {
			$response['content'] = $content; }
		if ( in_array( 'excerpt', $fields, true ) ) {
			$response['excerpt'] = $source->post_excerpt; }
		if ( in_array( 'author', $fields, true ) ) {
			$response['author'] = get_the_author_meta( 'display_name', (int) $source->post_author ); }
		if ( in_array( 'taxonomies', $fields, true ) ) {
			$response['taxonomies'] = $this->taxonomy_summary( $post ); }
		if ( in_array( 'seo', $fields, true ) ) {
			$response['seo'] = WPCP_SEO::adapter()->get( $post->ID ); }
		if ( in_array( 'media', $fields, true ) ) {
			$response['featuredMediaId'] = get_post_thumbnail_id( $post ); }
		if ( in_array( 'dates', $fields, true ) ) {
			$response['modified'] = get_post_modified_time( DATE_ATOM, true, $post ); }
		if ( in_array( 'links', $fields, true ) ) {
			$response['url']        = get_permalink( $post );
			$response['previewUrl'] = get_preview_post_link( $post );
		}
		return rest_ensure_response( $response );
	}
	/**
	 * Return revision metadata for one content item.
	 *
	 * @param WP_REST_Request $request REST request.
	 */
	public function revisions( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$post = get_post( absint( $request['id'] ) );
		if ( ! $post || ! current_user_can( 'read_post', $post->ID ) ) {
			return new WP_Error( 'wpcp_not_found', __( 'Content was not found.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 404 ) );
		} $revisions = wp_get_post_revisions( $post->ID, array( 'posts_per_page' => min( 25, max( 1, (int) ( $request['pageSize'] ? $request['pageSize'] : 10 ) ) ) ) );
		$items       = array();
		foreach ( $revisions as $revision ) {
			if ( ! $revision instanceof WP_Post ) {
				continue;
			}
			$items[] = array(
				'id'             => $revision->ID,
				'author'         => get_the_author_meta( 'display_name', (int) $revision->post_author ),
				'created'        => get_post_time( DATE_ATOM, true, $revision ),
				'titleChanged'   => $revision->post_title !== $post->post_title,
				'contentChanged' => $revision->post_content !== $post->post_content,
				'excerptChanged' => $revision->post_excerpt !== $post->post_excerpt,
			);
		} return rest_ensure_response(
			array(
				'items'      => $items,
				'pagination' => array(
					'nextCursor' => null,
					'truncated'  => false,
					'returned'   => count( $items ),
					'total'      => count( $items ),
				),
			)
		); }
	/**
	 * Create a draft with idempotency protection.
	 *
	 * @param WP_REST_Request $request REST request.
	 */
	public function create_draft( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		return $this->idempotent(
			$request,
			'create_draft',
			function () use ( $request ) {
				$post_type = sanitize_key( (string) ( $request['postType'] ? $request['postType'] : 'post' ) );
				if ( ! in_array( $post_type, $this->allowed_post_types( array( $post_type ) ), true ) ) {
					return new WP_Error( 'wpcp_unsupported_post_type', __( 'This post type is not supported for remote drafting.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 400 ) );
				} $format = sanitize_key( (string) ( $request['contentFormat'] ? $request['contentFormat'] : 'markdown' ) );
				$content  = 'markdown' === $format ? WPCP_Markdown::to_blocks( (string) $request['content'] ) : wp_kses_post( (string) $request['content'] );
				$post_id  = wp_insert_post(
					array(
						'post_type'    => $post_type,
						'post_status'  => 'draft',
						'post_title'   => sanitize_text_field( (string) $request['title'] ),
						'post_content' => $content,
						'post_excerpt' => sanitize_textarea_field( (string) $request['excerpt'] ),
						'post_name'    => sanitize_title( (string) $request['slug'] ),
						'post_author'  => $request['author'] && current_user_can( 'edit_others_posts' ) ? absint( $request['author'] ) : get_current_user_id(),
					),
					true
				);
				if ( is_wp_error( $post_id ) ) {
					return $post_id;
				} return $this->apply_patch( $request, $post_id, null );
			}
		); }
	/**
	 * Patch a draft with optimistic concurrency.
	 *
	 * @param WP_REST_Request $request REST request.
	 */
	public function update_draft( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$post = get_post( absint( $request['id'] ) );
		if ( ! $post || ! in_array( $post->post_status, array( 'draft', 'pending' ), true ) ) {
			return new WP_Error(
				'wpcp_not_draft',
				__( 'Only drafts and pending posts can be changed with this tool.', 'editorial-publisher-for-chatgpt' ),
				array(
					'status'      => 409,
					'remediation' => __( 'Use the separate published-content workflow when authorized.', 'editorial-publisher-for-chatgpt' ),
				)
			);
		} return $this->idempotent( $request, 'update_draft', fn() => $this->apply_patch( $request, $post->ID, $post ) ); }
	/**
	 * Patch already-published content through its dedicated route.
	 *
	 * @param WP_REST_Request $request REST request.
	 */
	public function update_published( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$post = get_post( absint( $request['id'] ) );
		if ( ! $post || 'publish' !== $post->post_status ) {
			return new WP_Error( 'wpcp_not_published', __( 'The published-content tool requires a published post.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 409 ) );
		} return $this->idempotent( $request, 'update_published', fn() => $this->apply_patch( $request, $post->ID, $post ) ); }
	/**
	 * Apply selected fields without rewriting untouched content.
	 *
	 * @param WP_REST_Request $request          REST request.
	 * @param int             $post_id          Post ID.
	 * @param WP_Post|null    $existing         Existing post snapshot.
	 */
	private function apply_patch( WP_REST_Request $request, int $post_id, ?WP_Post $existing ): WP_REST_Response|WP_Error {
		$lookup_id = $post_id;
		$post      = $existing ? $existing : get_post( $lookup_id );
		if ( ! $post || ! current_user_can( 'edit_post', $post_id ) ) {
			return new WP_Error( 'wpcp_capability_missing', __( 'The connected user cannot edit this content.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 403 ) ); }
		if ( $request['expectedVersion'] && ! hash_equals( $this->version( $post ), (string) $request['expectedVersion'] ) ) {
			return new WP_Error(
				'wpcp_edit_conflict',
				__( 'The post changed since it was reviewed.', 'editorial-publisher-for-chatgpt' ),
				array(
					'status'         => 409,
					'remediation'    => __( 'Retrieve the latest version, merge the changes, and retry.', 'editorial-publisher-for-chatgpt' ),
					'currentVersion' => $this->version( $post ),
				)
			); }
		$revisions = wp_get_post_revisions(
			$post_id,
			array(
				'posts_per_page' => 1,
				'orderby'        => 'date ID',
				'order'          => 'DESC',
			)
		);
		$before    = $revisions ? reset( $revisions ) : false;
		if ( ! $before instanceof WP_Post ) {
			$before = wp_save_post_revision( $post_id );
		}
		$update  = array( 'ID' => $post_id );
		$changed = array();
		if ( $request->has_param( 'title' ) ) {
			$update['post_title'] = sanitize_text_field( (string) $request['title'] );
			$changed[]            = 'title'; }
		if ( $request->has_param( 'excerpt' ) ) {
			$update['post_excerpt'] = sanitize_textarea_field( (string) $request['excerpt'] );
			$changed[]              = 'excerpt'; }
		if ( $request->has_param( 'slug' ) ) {
			$update['post_name'] = sanitize_title( (string) $request['slug'] );
			$changed[]           = 'slug'; }
		if ( $request->has_param( 'content' ) ) {
			$update['post_content'] = 'markdown' === (string) $request['contentFormat'] ? WPCP_Markdown::to_blocks( (string) $request['content'] ) : wp_kses_post( (string) $request['content'] );
			$changed[]              = 'content'; }
		if ( count( $update ) > 1 ) {
			$result = wp_update_post( $update, true );
			if ( is_wp_error( $result ) ) {
				return $result; }
		}
		if ( $request->has_param( 'categories' ) ) {
			wp_set_post_categories( $post_id, array_map( 'absint', (array) $request['categories'] ), false );
			$changed[] = 'categories'; }
		if ( $request->has_param( 'tags' ) ) {
			wp_set_post_tags( $post_id, array_map( 'absint', (array) $request['tags'] ), false );
			$changed[] = 'tags'; }
		if ( $request->has_param( 'featuredMediaId' ) ) {
			set_post_thumbnail( $post_id, absint( $request['featuredMediaId'] ) );
			$changed[] = 'featuredMediaId'; }
		$warnings = array();
		if ( $request->has_param( 'seo' ) ) {
			$seo      = WPCP_SEO::adapter()->set( $post_id, (array) $request['seo'] );
			$changed  = array_merge( $changed, array_map( static fn( string $field ): string => 'seo.' . $field, $seo['changed_fields'] ) );
			$warnings = $seo['warnings']; }
		$lookup_id = $post_id;
		$post      = get_post( $lookup_id );
		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'wpcp_update_failed', __( 'WordPress could not reload the updated content.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 500 ) );
		}
		$new_revision    = wp_save_post_revision( $post_id );
		$new_revision_id = is_int( $new_revision ) ? $new_revision : $this->latest_revision_id( $post_id );
		$audit_id        = WPCP_Audit::record( WPCP_Auth::connection( $request ), $existing ? 'update_content' : 'create_draft', $post->post_type, $post_id, $changed, $before instanceof WP_Post ? $before->ID : ( is_int( $before ) ? $before : null ), $new_revision_id ? $new_revision_id : null, 'success', WPCP_Audit::request_id( $request ) );
		return rest_ensure_response(
			array(
				'object'        => array(
					'type' => $post->post_type,
					'id'   => $post_id,
				),
				'changedFields' => array_values( array_unique( $changed ) ),
				'status'        => $post->post_status,
				'version'       => $this->version( $post ),
				'revisionId'    => $new_revision_id ? $new_revision_id : null,
				'warnings'      => $warnings,
				'auditEventId'  => $audit_id,
				'previewUrl'    => get_preview_post_link( $post ),
				'editUrl'       => get_edit_post_link( $post_id, 'raw' ),
				'publicUrl'     => 'publish' === $post->post_status ? get_permalink( $post ) : null,
			)
		);
	}
	/**
	 * List supported taxonomies.
	 *
	 * @param WP_REST_Request $request REST request.
	 */
	public function taxonomies( WP_REST_Request $request ): WP_REST_Response {
		$items = array();
		foreach ( get_taxonomies( array( 'show_in_rest' => true ), 'objects' ) as $taxonomy ) {
			if ( ! $taxonomy->public || ( $request['postType'] && ! in_array( sanitize_key( (string) $request['postType'] ), $taxonomy->object_type, true ) ) ) {
				continue;
			} $items[] = array(
				'name'         => $taxonomy->name,
				'label'        => $taxonomy->label,
				'hierarchical' => $taxonomy->hierarchical,
				'postTypes'    => array_values( $taxonomy->object_type ),
				'canAssign'    => current_user_can( $taxonomy->cap->assign_terms ),
			);
		} return rest_ensure_response( array( 'items' => $items ) ); }
	/**
	 * List existing taxonomy terms with cursor pagination.
	 *
	 * @param WP_REST_Request $request REST request.
	 */
	public function terms( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$taxonomy = get_taxonomy( sanitize_key( (string) $request['taxonomy'] ) );
		if ( ! $taxonomy || ! $taxonomy->show_in_rest ) {
			return new WP_Error( 'wpcp_unsupported_taxonomy', __( 'This taxonomy is not supported.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 400 ) );
		}
		$page_size = min( 100, max( 1, (int) ( $request['pageSize'] ? $request['pageSize'] : 25 ) ) );
		$page      = $this->decode_cursor( (string) $request['cursor'] );
		$terms     = get_terms(
			array(
				'taxonomy'   => $taxonomy->name,
				'search'     => sanitize_text_field( (string) $request['query'] ),
				'number'     => $page_size,
				'offset'     => ( $page - 1 ) * $page_size,
				'hide_empty' => false,
			)
		);
		if ( is_wp_error( $terms ) ) {
			return $terms;
		}
		$total = wp_count_terms(
			array(
				'taxonomy'   => $taxonomy->name,
				'hide_empty' => false,
			)
		);
		$total = is_wp_error( $total ) ? count( $terms ) : (int) $total;
		$next  = $page * $page_size < $total ? $this->encode_cursor( $page + 1 ) : null;
		return rest_ensure_response(
			array(
				'items'      => array_map(
					static fn( WP_Term $term ): array => array(
						'id'     => $term->term_id,
						'name'   => $term->name,
						'slug'   => $term->slug,
						'count'  => $term->count,
						'parent' => $term->parent,
					),
					$terms
				),
				'pagination' => array(
					'nextCursor' => $next,
					'truncated'  => null !== $next,
					'returned'   => count( $terms ),
					'total'      => $total,
				),
			)
		); }
	/**
	 * Replace one taxonomy assignment with idempotency protection.
	 *
	 * @param WP_REST_Request $request REST request.
	 */
	public function assign_terms( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		return $this->idempotent(
			$request,
			'assign_terms',
			function () use ( $request ) {
				$post     = get_post( absint( $request['contentId'] ) );
				$taxonomy = get_taxonomy( sanitize_key( (string) $request['taxonomy'] ) );
				if ( ! $post || ! $taxonomy || ! current_user_can( 'edit_post', $post->ID ) || ! current_user_can( $taxonomy->cap->assign_terms ) ) {
					return new WP_Error( 'wpcp_capability_missing', __( 'The taxonomy assignment is not allowed.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 403 ) );
				} if ( ! hash_equals( $this->version( $post ), (string) $request['expectedVersion'] ) ) {
					return new WP_Error( 'wpcp_edit_conflict', __( 'The post changed since it was reviewed.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 409 ) );
				} $result = wp_set_object_terms( $post->ID, array_map( 'absint', (array) $request['termIds'] ), $taxonomy->name, false );
				if ( is_wp_error( $result ) ) {
					return $result;
				} return $this->write_result( $request, $post, 'assign_terms', array( 'taxonomy.' . $taxonomy->name ), null );
			}
		); }
	/**
	 * Search image attachment metadata.
	 *
	 * @param WP_REST_Request $request REST request.
	 */
	public function search_media( WP_REST_Request $request ): WP_REST_Response {
		$page_size = min( 50, max( 1, (int) ( $request['pageSize'] ? $request['pageSize'] : 12 ) ) );
		$page      = $this->decode_cursor( (string) $request['cursor'] );
		$query     = new WP_Query(
			array(
				'post_type'      => 'attachment',
				'post_status'    => 'inherit',
				'post_mime_type' => $request['mimeType'] ? sanitize_mime_type( (string) $request['mimeType'] ) : 'image',
				's'              => sanitize_text_field( (string) $request['query'] ),
				'posts_per_page' => $page_size,
				'paged'          => $page,
				'no_found_rows'  => false,
			)
		);
		$items     = array();
		foreach ( $query->posts as $item ) {
			if ( ! $item instanceof WP_Post ) {
				continue;
			}
			$meta    = wp_get_attachment_metadata( $item->ID );
			$items[] = array(
				'id'           => $item->ID,
				'title'        => get_the_title( $item ),
				'mimeType'     => get_post_mime_type( $item ),
				'altText'      => get_post_meta( $item->ID, '_wp_attachment_image_alt', true ),
				'thumbnailUrl' => wp_get_attachment_image_url( $item->ID, 'thumbnail' ),
				'url'          => wp_get_attachment_url( $item->ID ),
				'width'        => (int) ( $meta['width'] ?? 0 ),
				'height'       => (int) ( $meta['height'] ?? 0 ),
			);
		}
		$next = $page < (int) $query->max_num_pages ? $this->encode_cursor( $page + 1 ) : null;
		return rest_ensure_response(
			array(
				'items'      => $items,
				'pagination' => array(
					'nextCursor' => $next,
					'truncated'  => null !== $next,
					'returned'   => count( $items ),
					'total'      => (int) $query->found_posts,
				),
			)
		); }
	/**
	 * Securely fetch and sideload one verified image.
	 *
	 * @param WP_REST_Request $request REST request.
	 */
	public function upload_media( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		return $this->idempotent(
			$request,
			'upload_media',
			function () use ( $request ) {
				require_once ABSPATH . 'wp-admin/includes/file.php';
				require_once ABSPATH . 'wp-admin/includes/media.php';
				require_once ABSPATH . 'wp-admin/includes/image.php';
				$files     = $request->get_file_params();
				$upload    = isset( $files['file'] ) && is_array( $files['file'] ) ? $files['file'] : null;
				$url       = esc_url_raw( (string) $request['sourceUrl'] );
				$file_name = sanitize_file_name( (string) ( $request['fileName'] ? $request['fileName'] : ( $upload['name'] ?? '' ) ) );
				if ( (bool) $upload === (bool) $url ) {
					return new WP_Error( 'wpcp_media_source_required', __( 'Provide exactly one multipart connector file or approved HTTPS image URL.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 400 ) );
				}
				if ( $url && ! str_starts_with( $url, 'https://' ) ) {
					return new WP_Error( 'wpcp_unsafe_media_url', __( 'Remote media must use an approved HTTPS URL.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 400 ) );
				}
				if ( '' === $file_name || ! preg_match( '/\.(?:jpe?g|png|gif|webp|avif)$/i', $file_name ) ) {
					return new WP_Error( 'wpcp_unsafe_filename', __( 'The image filename must use a supported image extension.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 400 ) );
				}
				if ( $upload ) {
					$tmp = isset( $upload['tmp_name'] ) ? (string) $upload['tmp_name'] : '';
					if ( UPLOAD_ERR_OK !== (int) ( $upload['error'] ?? UPLOAD_ERR_NO_FILE ) || '' === $tmp || ! is_uploaded_file( $tmp ) ) {
						return new WP_Error( 'wpcp_upload_failed', __( 'WordPress did not receive a valid multipart connector file.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 400 ) );
					}
					$file_size = filesize( $tmp );
					if ( false === $file_size ) {
						return new WP_Error( 'wpcp_upload_failed', __( 'WordPress could not inspect the uploaded file.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 500 ) );
					}
					if ( $file_size > wp_max_upload_size() ) {
						return new WP_Error( 'wpcp_file_too_large', __( 'The image exceeds the WordPress upload limit.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 413 ) );
					}
					$expected_hash = (string) $request['fileSha256'];
					$actual_hash   = hash_file( 'sha256', $tmp );
					if ( ! preg_match( '/^[a-f0-9]{64}$/', $expected_hash ) || ! is_string( $actual_hash ) || ! hash_equals( $expected_hash, $actual_hash ) ) {
						return new WP_Error( 'wpcp_upload_hash_mismatch', __( 'The multipart image did not match the connector file digest.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 400 ) );
					}
				} else {
					$response = wp_safe_remote_get(
						$url,
						array(
							'timeout'             => 15,
							'redirection'         => 0,
							'limit_response_size' => wp_max_upload_size(),
							'headers'             => array( 'Accept' => 'image/*' ),
						)
					);
					if ( is_wp_error( $response ) ) {
						return new WP_Error( 'wpcp_media_fetch_failed', __( 'The remote image could not be fetched safely.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 400 ) );
					}
					if ( 200 !== wp_remote_retrieve_response_code( $response ) ) {
						return new WP_Error( 'wpcp_media_fetch_failed', __( 'The remote image did not return a successful response.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 400 ) );
					}
					$body = wp_remote_retrieve_body( $response );
					if ( '' === $body || strlen( $body ) > wp_max_upload_size() ) {
						return new WP_Error( 'wpcp_file_too_large', __( 'The image exceeds the WordPress upload limit.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 413 ) );
					}
					$tmp = wp_tempnam( $file_name );
					if ( ! $tmp ) {
						return new WP_Error( 'wpcp_upload_failed', __( 'WordPress could not create a temporary upload file.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 500 ) );
					}
					if ( strlen( $body ) !== file_put_contents( $tmp, $body ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
						wp_delete_file( $tmp );
						return new WP_Error( 'wpcp_upload_failed', __( 'WordPress could not stage the remote image.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 500 ) );
					}
				}
				$finfo = new finfo( FILEINFO_MIME_TYPE );
				$mime  = $finfo->file( $tmp );
				if ( ! is_string( $mime ) || ! in_array(
					$mime,
					self::IMAGE_MIMES,
					true
				) ) {
					wp_delete_file( $tmp );
					return new WP_Error(
						'wpcp_unsupported_mime',
						__( 'Only verified JPEG, PNG, GIF, WebP, and AVIF images are allowed.', 'editorial-publisher-for-chatgpt' ),
						array( 'status' => 415 )
					);
				}
				$allowed_mimes = array(
					'jpg|jpeg|jpe' => 'image/jpeg',
					'png'          => 'image/png',
					'gif'          => 'image/gif',
					'webp'         => 'image/webp',
					'avif'         => 'image/avif',
				);
				$checked       = wp_check_filetype_and_ext( $tmp, $file_name, $allowed_mimes );
				$image_editor  = wp_get_image_editor( $tmp );
				if ( empty( $checked['ext'] ) || empty( $checked['type'] ) || $checked['type'] !== $mime || is_wp_error( $image_editor ) ) {
					wp_delete_file( $tmp );
					return new WP_Error( 'wpcp_image_validation_failed', __( 'The file content does not match a supported image format.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 415 ) );
				}
				$file_size = filesize( $tmp );
				if ( false === $file_size ) {
					wp_delete_file( $tmp );
					return new WP_Error( 'wpcp_upload_failed', __( 'WordPress could not inspect the temporary upload.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 500 ) );
				}
				$file          = array(
					'name'     => $file_name,
					'tmp_name' => $tmp,
					'type'     => $mime,
					'error'    => '0',
					'size'     => (string) $file_size,
				);
				$attachment_id = media_handle_sideload(
					$file,
					0,
					sanitize_text_field( (string) $request['title'] ),
					array(
						'post_excerpt' => sanitize_textarea_field( (string) $request['caption'] ),
						'post_content' => sanitize_textarea_field( (string) $request['description'] ),
					)
				);
				if ( is_wp_error( $attachment_id ) ) {
					wp_delete_file( $tmp );
					return $attachment_id;
				} update_post_meta(
					$attachment_id,
					'_wp_attachment_image_alt',
					sanitize_text_field( (string) $request['altText'] )
				);
				$attachment_lookup = $attachment_id;
				$attachment        = get_post( $attachment_lookup );
				if ( ! $attachment instanceof WP_Post ) {
					return new WP_Error( 'wpcp_upload_failed', __( 'WordPress could not reload the new attachment.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 500 ) );
				}
				$result     = $this->write_result(
					$request,
					$attachment,
					'upload_media',
					array( 'file', 'title', 'caption', 'description', 'altText' ),
					null
				);
				$data       = $result->get_data();
				$image_meta = wp_get_attachment_metadata( $attachment_id );
				$data      += array(
					'attachmentId' => $attachment_id,
					'url'          => wp_get_attachment_url( $attachment_id ),
					'mimeType'     => get_post_mime_type( $attachment_id ),
					'width'        => (int) ( is_array( $image_meta ) ? ( $image_meta['width'] ?? 0 ) : 0 ),
					'height'       => (int) ( is_array( $image_meta ) ? ( $image_meta['height'] ?? 0 ) : 0 ),
					'metadata'     => array(
						'title'       => $attachment->post_title,
						'caption'     => $attachment->post_excerpt,
						'description' => $attachment->post_content,
						'altText'     => get_post_meta( $attachment_id, '_wp_attachment_image_alt', true ),
						'fileName'    => wp_basename( (string) get_attached_file( $attachment_id ) ),
					),
				);
				return rest_ensure_response( $data );
			}
		); }
	/**
	 * Patch media attachment metadata.
	 *
	 * @param WP_REST_Request $request REST request.
	 */
	public function update_media( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		return $this->idempotent(
			$request,
			'update_media',
			function () use ( $request ) {
				$media = get_post( absint( $request['mediaId'] ) );
				if ( ! $media || 'attachment' !== $media->post_type || ! current_user_can( 'edit_post', $media->ID ) ) {
					return new WP_Error( 'wpcp_media_not_found', __( 'The media attachment was not found or is not editable.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 404 ) );
				} $update = array( 'ID' => $media->ID );
				$changed  = array();
				foreach ( array(
					'title'       => 'post_title',
					'caption'     => 'post_excerpt',
					'description' => 'post_content',
				) as $input => $field ) {
					if ( $request->has_param( $input ) ) {
						$update[ $field ] = sanitize_textarea_field( (string) $request[ $input ] );
						$changed[]        = $input;
					}
				} if ( count( $update ) > 1 ) {
					wp_update_post( $update );
				} if ( $request->has_param( 'altText' ) ) {
					update_post_meta( $media->ID, '_wp_attachment_image_alt', sanitize_text_field( (string) $request['altText'] ) );
					$changed[] = 'altText';
				}
				$media_lookup = $media->ID;
				$updated      = get_post( $media_lookup );
				if ( ! $updated instanceof WP_Post ) {
					return new WP_Error( 'wpcp_media_not_found', __( 'WordPress could not reload the updated attachment.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 500 ) );
				}
				return $this->write_result( $request, $updated, 'update_media', $changed, null );
			}
		); }
	/**
	 * Set or clear one featured image.
	 *
	 * @param WP_REST_Request $request REST request.
	 */
	public function featured_media( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		return $this->idempotent(
			$request,
			'featured_media',
			function () use ( $request ) {
				$post = get_post( absint( $request['contentId'] ) );
				if ( ! $post || ! current_user_can( 'edit_post', $post->ID ) ) {
					return new WP_Error( 'wpcp_not_found', __( 'The content was not found or is not editable.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 404 ) );
				} if ( ! hash_equals( $this->version( $post ), (string) $request['expectedVersion'] ) ) {
					return new WP_Error( 'wpcp_edit_conflict', __( 'The post changed since it was reviewed.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 409 ) );
				} $media_id = absint( $request['mediaId'] );
				if ( $media_id && ! wp_attachment_is_image( $media_id ) ) {
					return new WP_Error( 'wpcp_invalid_media', __( 'The featured media must be an image attachment.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 400 ) );
				}
				if ( $media_id ) {
					set_post_thumbnail( $post->ID, $media_id );
				} else {
					delete_post_thumbnail( $post->ID );
				}
				$updated_lookup = $post->ID;
				$updated        = get_post( $updated_lookup );
				if ( ! $updated instanceof WP_Post ) {
					return new WP_Error( 'wpcp_not_found', __( 'WordPress could not reload the updated content.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 500 ) );
				}
				return $this->write_result( $request, $updated, 'set_featured_image', array( 'featuredMediaId' ), null );
			}
		); }
	/**
	 * Read normalized SEO metadata.
	 *
	 * @param WP_REST_Request $request REST request.
	 */
	public function get_seo( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$post = get_post( absint( $request['contentId'] ) );
		if ( ! $post || ! current_user_can( 'read_post', $post->ID ) ) {
			return new WP_Error( 'wpcp_not_found', __( 'Content was not found.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 404 ) );
		} return rest_ensure_response( WPCP_SEO::adapter()->get( $post->ID ) ); }
	/**
	 * Patch normalized SEO metadata.
	 *
	 * @param WP_REST_Request $request REST request.
	 */
	public function set_seo( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		return $this->idempotent(
			$request,
			'set_seo',
			function () use ( $request ) {
				$post = get_post( absint( $request['contentId'] ) );
				if ( ! $post || ! current_user_can( 'edit_post', $post->ID ) ) {
					return new WP_Error( 'wpcp_not_found', __( 'Content was not found or is not editable.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 404 ) );
				} if ( ! hash_equals( $this->version( $post ), (string) $request['expectedVersion'] ) ) {
					return new WP_Error( 'wpcp_edit_conflict', __( 'The post changed since it was reviewed.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 409 ) );
				} $result = WPCP_SEO::adapter()->set( $post->ID, (array) $request['metadata'] );
				return $this->write_result( $request, $post, 'set_seo', array_map( static fn( string $field ): string => 'seo.' . $field, $result['changed_fields'] ), $result['warnings'] );
			}
		); }
	/**
	 * Return a structured pre-publication review.
	 *
	 * @param WP_REST_Request $request REST request.
	 */
	public function preview( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		$post = get_post( absint( $request['contentId'] ) );
		if ( ! $post || ! current_user_can( 'read_post', $post->ID ) ) {
			return new WP_Error( 'wpcp_not_found', __( 'Content was not found.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 404 ) );
		}
		$seo               = WPCP_SEO::adapter()->get( $post->ID );
		$featured_media_id = get_post_thumbnail_id( $post );
		$warnings          = array();
		if ( ! get_post_thumbnail_id( $post ) ) {
			$warnings[] = __( 'No featured image is set.', 'editorial-publisher-for-chatgpt' );
		} if ( empty( $seo['metadata']['description'] ) ) {
			$warnings[] = __( 'No SEO meta description is set.', 'editorial-publisher-for-chatgpt' );
		} return rest_ensure_response(
			array(
				'id'            => $post->ID,
				'site'          => get_bloginfo( 'name' ),
				'title'         => get_the_title( $post ),
				'postType'      => $post->post_type,
				'status'        => $post->post_status,
				'version'       => $this->version( $post ),
				'author'        => get_the_author_meta( 'display_name', (int) $post->post_author ),
				'slug'          => $post->post_name,
				'categories'    => wp_get_post_categories( $post->ID, array( 'fields' => 'names' ) ),
				'tags'          => wp_get_post_tags( $post->ID, array( 'fields' => 'names' ) ),
				'wordCount'     => str_word_count( wp_strip_all_tags( $post->post_content ) ),
				'featuredImage' => array(
					'id'    => $featured_media_id,
					'title' => $featured_media_id ? get_the_title( $featured_media_id ) : '',
				),
				'seo'           => $seo['metadata'],
				'previewUrl'    => get_preview_post_link( $post ),
				'scheduledAt'   => 'future' === $post->post_status ? get_post_time( DATE_ATOM, true, $post ) : null,
				'siteTimezone'  => wp_timezone_string(),
				'warnings'      => $warnings,
			)
		); }
	/**
	 * Schedule one post at an explicit future instant.
	 *
	 * @param WP_REST_Request $request REST request.
	 */
	public function schedule( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		return $this->idempotent(
			$request,
			'schedule',
			function () use ( $request ) {
				$post      = get_post( absint( $request['contentId'] ) );
				$post_type = $post ? get_post_type_object( $post->post_type ) : null;
				if ( ! $post || ! $post_type || ! current_user_can( $post_type->cap->publish_posts ) || ! current_user_can( 'edit_post', $post->ID ) ) {
					return new WP_Error( 'wpcp_capability_missing', __( 'The connected user cannot schedule this post.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 403 ) );
				}
				if ( wp_timezone_string() !== (string) $request['siteTimezone'] ) {
					return new WP_Error(
						'wpcp_timezone_mismatch',
						__( 'The supplied site timezone does not match the current WordPress timezone.', 'editorial-publisher-for-chatgpt' ),
						array(
							'status'       => 409,
							'siteTimezone' => wp_timezone_string(),
						)
					);
				}
				if ( ! hash_equals( $this->version( $post ), (string) $request['expectedVersion'] ) ) {
					return new WP_Error( 'wpcp_edit_conflict', __( 'The post changed since confirmation.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 409 ) );
				} $timestamp = strtotime( (string) $request['publishAt'] );
				if ( false === $timestamp || time() + 60 >= $timestamp ) {
					return new WP_Error( 'wpcp_invalid_schedule', __( 'The scheduled time must be at least one minute in the future.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 400 ) );
				} $result = wp_update_post(
					array(
						'ID'            => $post->ID,
						'post_status'   => 'future',
						'edit_date'     => true,
						'post_date_gmt' => gmdate( 'Y-m-d H:i:s', $timestamp ),
						'post_date'     => get_date_from_gmt( gmdate( 'Y-m-d H:i:s', $timestamp ) ),
					),
					true
				);
				if ( is_wp_error( $result ) ) {
					return $result;
				}
				$updated_lookup = $post->ID;
				$updated        = get_post( $updated_lookup );
				if ( ! $updated instanceof WP_Post ) {
					return new WP_Error( 'wpcp_schedule_failed', __( 'WordPress could not reload the scheduled post.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 500 ) );
				}
				$response                = $this->write_result( $request, $updated, 'schedule', array( 'status', 'publishAt' ), null );
				$data                    = $response->get_data();
				$data['scheduledAtUtc']  = gmdate( DATE_ATOM, $timestamp );
				$data['scheduledAtSite'] = wp_date( DATE_ATOM, $timestamp, wp_timezone() );
				$data['siteTimezone']    = wp_timezone_string();
				$response->set_data( $data );
				return $response;
			}
		); }
	/**
	 * Publish one confirmed post.
	 *
	 * @param WP_REST_Request $request REST request.
	 */
	public function publish( WP_REST_Request $request ): WP_REST_Response|WP_Error {
		return $this->idempotent(
			$request,
			'publish',
			function () use ( $request ) {
				$post      = get_post( absint( $request['contentId'] ) );
				$post_type = $post ? get_post_type_object( $post->post_type ) : null;
				if ( ! $post || ! $post_type || ! current_user_can( $post_type->cap->publish_posts ) || ! current_user_can( 'edit_post', $post->ID ) ) {
					return new WP_Error( 'wpcp_capability_missing', __( 'The connected user cannot publish this post.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 403 ) );
				} if ( ! hash_equals( $this->version( $post ), (string) $request['expectedVersion'] ) ) {
					return new WP_Error( 'wpcp_edit_conflict', __( 'The post changed since confirmation.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 409 ) );
				} $result = wp_update_post(
					array(
						'ID'          => $post->ID,
						'post_status' => 'publish',
					),
					true
				);
				if ( is_wp_error( $result ) ) {
					return $result;
				}
				$updated_lookup = $post->ID;
				$updated        = get_post( $updated_lookup );
				if ( ! $updated instanceof WP_Post ) {
					return new WP_Error( 'wpcp_publish_failed', __( 'WordPress could not reload the published post.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 500 ) );
				}
				return $this->write_result( $request, $updated, 'publish', array( 'status' ), null );
			}
		); }
	/**
	 * Build a consistent write result and audit event.
	 *
	 * @param WP_REST_Request    $request  REST request.
	 * @param WP_Post            $post     Changed post.
	 * @param string             $action   Stable action identifier.
	 * @param array<string>      $fields   Changed fields.
	 * @param array<string>|null $warnings Warnings.
	 */
	private function write_result( WP_REST_Request $request, WP_Post $post, string $action, array $fields, ?array $warnings ): WP_REST_Response {
		$revision    = wp_save_post_revision( $post->ID );
		$revision_id = is_int( $revision ) ? $revision : $this->latest_revision_id( $post->ID );
		$audit       = WPCP_Audit::record( WPCP_Auth::connection( $request ), $action, $post->post_type, $post->ID, $fields, null, $revision_id ? $revision_id : null, 'success', WPCP_Audit::request_id( $request ) );
		return rest_ensure_response(
			array(
				'object'        => array(
					'type' => $post->post_type,
					'id'   => $post->ID,
				),
				'changedFields' => $fields,
				'status'        => $post->post_status,
				'version'       => $this->version( $post ),
				'revisionId'    => $revision_id ? $revision_id : null,
				'warnings'      => $warnings ? $warnings : array(),
				'auditEventId'  => $audit,
				'previewUrl'    => get_preview_post_link( $post ),
				'editUrl'       => get_edit_post_link( $post->ID, 'raw' ),
				'publicUrl'     => 'publish' === $post->post_status ? get_permalink( $post ) : null,
			)
		); }
	/**
	 * Execute or replay one idempotent write.
	 *
	 * @param WP_REST_Request $request   REST request.
	 * @param string          $action    Stable action identifier.
	 * @param callable        $operation Write operation.
	 */
	private function idempotent( WP_REST_Request $request, string $action, callable $operation ): WP_REST_Response|WP_Error {
		$key = (string) $request['idempotencyKey'];
		if ( ! wp_is_uuid( $key ) ) {
			return new WP_Error( 'wpcp_idempotency_required', __( 'A UUID idempotency key is required for write operations.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 400 ) ); }
		$connection    = WPCP_Auth::connection( $request );
		$connection_id = (string) $connection['id'];
		$params        = $request->get_json_params();
		if ( ! is_array( $params ) ) {
			$params = $request->get_body_params();
		}
		unset( $params['confirmationToken'] );
		$encoded_params = wp_json_encode( $params );
		if ( false === $encoded_params ) {
			return new WP_Error( 'wpcp_invalid_request', __( 'The write request could not be encoded safely.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 400 ) );
		}
		$request_hash = hash( 'sha256', $encoded_params );
		global $wpdb;
		$table    = WPCP_DB::table( 'idempotency' );
		$inserted = $wpdb->query( $wpdb->prepare( 'INSERT IGNORE INTO %i (connection_id,idempotency_key,action,request_hash,response,created_at) VALUES (%s,%s,%s,%s,NULL,%s)', $table, $connection_id, $key, $action, $request_hash, current_time( 'mysql', true ) ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Atomic reservation in a plugin-owned idempotency table.
		if ( false === $inserted ) {
			return new WP_Error( 'wpcp_idempotency_unavailable', __( 'The write could not reserve an idempotency key.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 500 ) );
		}
		if ( 0 === $inserted ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Replay checks require current plugin-owned idempotency state.
			$existing = $wpdb->get_row( $wpdb->prepare( 'SELECT action,request_hash,response FROM %i WHERE connection_id = %s AND idempotency_key = %s', $table, $connection_id, $key ), ARRAY_A );
			if ( ! $existing || $existing['action'] !== $action || ! hash_equals( $existing['request_hash'], $request_hash ) ) {
				return new WP_Error( 'wpcp_idempotency_reuse', __( 'The idempotency key was already used with different input.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 409 ) );
			} if ( $existing['response'] ) {
				return rest_ensure_response( json_decode( (string) $existing['response'], true ) );
			} return new WP_Error( 'wpcp_request_in_progress', __( 'An identical write operation is still in progress.', 'editorial-publisher-for-chatgpt' ), array( 'status' => 409 ) ); }
		$result = $operation();
		if ( is_wp_error( $result ) ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Releases a failed reservation in the plugin-owned idempotency table.
			$wpdb->delete(
				$table,
				array(
					'connection_id'   => $connection_id,
					'idempotency_key' => $key,
				),
				array( '%s', '%s' )
			);
			return $result;
		} $data = $result instanceof WP_REST_Response ? $result->get_data() : $result;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Persists the replay response in the plugin-owned idempotency table.
		$wpdb->update(
			$table,
			array( 'response' => wp_json_encode( $data ) ),
			array(
				'connection_id'   => $connection_id,
				'idempotency_key' => $key,
			),
			array( '%s' ),
			array( '%s', '%s' )
		);
		return rest_ensure_response( $data );
	}
	/**
	 * Intersect requested post types with safe editor-enabled types.
	 *
	 * @param array<string> $requested Requested types.
	 * @return list<string>
	 */
	private function allowed_post_types( array $requested ): array {
		$allowed = array();
		foreach ( get_post_types( array( 'show_in_rest' => true ), 'objects' ) as $type ) {
			if ( $type->public && post_type_supports( $type->name, 'editor' ) && ! in_array( $type->name, array( 'attachment', 'wp_block', 'wp_template', 'wp_template_part', 'wp_navigation' ), true ) ) {
				$allowed[] = $type->name;
			}
		} return array_values( array_intersect( array_map( 'sanitize_key', $requested ), $allowed ) ); }
	/**
	 * Return taxonomy names keyed by taxonomy.
	 *
	 * @param WP_Post $post Content object.
	 * @return array<string,array<string>> Taxonomy names keyed by taxonomy.
	 */
	private function taxonomy_summary( WP_Post $post ): array {
		$output = array();
		foreach ( get_object_taxonomies( $post->post_type, 'objects' ) as $taxonomy ) {
			if ( ! $taxonomy->show_in_rest ) {
				continue;
			} $terms = wp_get_object_terms( $post->ID, $taxonomy->name, array( 'fields' => 'names' ) );
			if ( ! is_wp_error( $terms ) ) {
				$output[ $taxonomy->name ] = $terms;
			}
		} return $output; }
	/**
	 * Return an optimistic-concurrency version hash.
	 *
	 * @param WP_Post $post Content object.
	 */
	private function version( WP_Post $post ): string {
		$revision_id = $this->latest_revision_id( $post->ID );
		return hash( 'sha256', $post->ID . '|' . $post->post_modified_gmt . '|' . $revision_id ); }
	/**
	 * Return the latest core revision ID, if one exists.
	 *
	 * @param int $post_id Content ID.
	 */
	private function latest_revision_id( int $post_id ): int {
		$revisions       = wp_get_post_revisions(
			$post_id,
			array(
				'posts_per_page' => 1,
				'fields'         => 'ids',
				'orderby'        => 'date ID',
				'order'          => 'DESC',
			)
		);
		$latest_revision = $revisions ? reset( $revisions ) : false;
		return is_int( $latest_revision ) ? $latest_revision : ( $latest_revision instanceof WP_Post ? $latest_revision->ID : 0 ); }
	/**
	 * Encode a stable page cursor.
	 *
	 * @param int $page Page number.
	 */
	private function encode_cursor( int $page ): string {
		$encoded = wp_json_encode( array( 'page' => $page ) );
		// phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- Opaque pagination cursor encoding.
		return false === $encoded ? '' : rtrim( strtr( base64_encode( $encoded ), '+/', '-_' ), '=' );
	}
	/**
	 * Decode a stable page cursor.
	 *
	 * @param string $cursor Encoded cursor.
	 */
	private function decode_cursor( string $cursor ): int {
		if ( '' === $cursor ) {
			return 1;
		} $data = json_decode( (string) base64_decode( strtr( $cursor, '-_', '+/' ), true ), true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode -- Opaque pagination cursor decoding.
		return is_array( $data ) && isset( $data['page'] ) ? max( 1, absint( $data['page'] ) ) : 1; }
}
