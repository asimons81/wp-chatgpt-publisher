<?php
/**
 * Seed a disposable WordPress test site. Run only through WP-CLI in local/CI.
 */

if ( ! defined( 'WP_CLI' ) || ! WP_CLI ) { exit( "WP-CLI only\n" ); }
if ( ! in_array( wp_get_environment_type(), array( 'local', 'development' ), true ) ) { WP_CLI::error( 'Refusing to seed a non-development environment.' ); }

$plugin_file = WP_PLUGIN_DIR . '/editorial-publisher-for-chatgpt/editorial-publisher-for-chatgpt.php';
if ( ! is_plugin_active( 'editorial-publisher-for-chatgpt/editorial-publisher-for-chatgpt.php' ) ) { activate_plugin( $plugin_file ); }

update_option( 'permalink_structure', '/%postname%/' ); flush_rewrite_rules();

function wpcp_test_user( string $login, string $role ): int {
	$user = get_user_by( 'login', $login ); if ( $user ) { return (int) $user->ID; }
	return (int) wp_insert_user( array( 'user_login' => $login, 'user_pass' => wp_generate_password( 24, true ), 'user_email' => $login . '@example.test', 'display_name' => ucfirst( $login ) . ' Test', 'role' => $role ) );
}
$editor_id = wpcp_test_user( 'publisher-editor', 'editor' ); wpcp_test_user( 'publisher-author', 'author' );

$category = wp_insert_term( 'Release Safety', 'category', array( 'slug' => 'release-safety' ) ); $category_id = is_wp_error( $category ) ? (int) get_term_by( 'slug', 'release-safety', 'category' )->term_id : (int) $category['term_id'];
$tag = wp_insert_term( 'MCP', 'post_tag', array( 'slug' => 'mcp' ) ); $tag_id = is_wp_error( $tag ) ? (int) get_term_by( 'slug', 'mcp', 'post_tag' )->term_id : (int) $tag['term_id'];

$published_id = wp_insert_post( array( 'post_type' => 'post', 'post_status' => 'publish', 'post_title' => 'Release Safety Handbook', 'post_name' => 'release-safety-handbook', 'post_author' => $editor_id, 'post_category' => array( $category_id ), 'tags_input' => array( $tag_id ), 'post_content' => '<!-- wp:heading --><h2 class="wp-block-heading">Safe releases</h2><!-- /wp:heading --><!-- wp:paragraph --><p>Use explicit review, checksums, rollback, and revocation.</p><!-- /wp:paragraph --><!-- wp:list --><ul class="wp-block-list"><!-- wp:list-item --><li>Review</li><!-- /wp:list-item --><!-- wp:list-item --><li>Verify</li><!-- /wp:list-item --></ul><!-- /wp:list -->' ) );
wp_update_post( array( 'ID' => $published_id, 'post_content' => get_post_field( 'post_content', $published_id ) . '<!-- wp:paragraph --><p>Revision evidence.</p><!-- /wp:paragraph -->' ) );

$draft_id = wp_insert_post( array( 'post_type' => 'post', 'post_status' => 'draft', 'post_title' => 'Editorial Draft Fixture', 'post_author' => $editor_id, 'post_content' => '<p>Classic editor content with <strong>formatting</strong> and a <a href="https://example.test/internal">link</a>.</p>' ) );
$page_id = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Publisher About Page', 'post_author' => $editor_id, 'post_content' => '<!-- wp:paragraph --><p>Disposable acceptance content.</p><!-- /wp:paragraph -->' ) );

$book_id = wp_insert_post( array( 'post_type' => 'wpcp_book', 'post_status' => 'draft', 'post_title' => 'Custom Post Type Fixture', 'post_author' => $editor_id, 'post_content' => '<!-- wp:paragraph --><p>Custom type content.</p><!-- /wp:paragraph -->' ) );
$genre = wp_insert_term( 'Technical', 'wpcp_genre' ); if ( ! is_wp_error( $genre ) ) { wp_set_object_terms( $book_id, array( (int) $genre['term_id'] ), 'wpcp_genre' ); }

global $wpdb; $table = WPCP_DB::table( 'connections' );
$connections = array(
	array( 'id' => '10000000-0000-4000-8000-000000000001', 'token' => getenv( 'WPCP_TEST_EDITORIAL_TOKEN' ) ?: 'wpcp-editorial-test-token-000000000000000000000000', 'name' => 'CI Editorial', 'scopes' => WPCP_Scopes::EDITORIAL ),
	array( 'id' => '10000000-0000-4000-8000-000000000002', 'token' => getenv( 'WPCP_TEST_PUBLISHER_TOKEN' ) ?: 'wpcp-publisher-test-token-000000000000000000000000', 'name' => 'CI Publisher', 'scopes' => WPCP_Scopes::PUBLISHER ),
);
foreach ( $connections as $connection ) { $wpdb->replace( $table, array( 'id' => $connection['id'], 'friendly_name' => $connection['name'], 'user_id' => $editor_id, 'service_url' => 'https://mcp.example.test', 'client_id' => 'ci-client', 'token_hash' => WPCP_Auth::token_hash( $connection['token'] ), 'scopes' => wp_json_encode( $connection['scopes'] ), 'created_at' => current_time( 'mysql', true ), 'last_used_at' => null, 'revoked_at' => null ), array( '%s', '%s', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s' ) ); }

WP_CLI::line( wp_json_encode( array( 'editorUserId' => $editor_id, 'publishedId' => $published_id, 'draftId' => $draft_id, 'pageId' => $page_id, 'bookId' => $book_id, 'categoryId' => $category_id, 'tagId' => $tag_id ) ) );
