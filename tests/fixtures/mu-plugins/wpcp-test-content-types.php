<?php
/**
 * Persistent custom content types for disposable integration tests.
 *
 * @package WPChatGPTPublisherTests
 */

add_action(
	'init',
	static function (): void {
		register_post_type(
			'wpcp_book',
			array(
				'public'       => true,
				'show_in_rest' => true,
				'supports'     => array( 'title', 'editor', 'revisions' ),
				'label'        => 'Books',
			)
		);
		register_taxonomy(
			'wpcp_genre',
			'wpcp_book',
			array(
				'public'       => true,
				'show_in_rest' => true,
				'hierarchical' => true,
				'label'        => 'Genres',
			)
		);
	}
);
