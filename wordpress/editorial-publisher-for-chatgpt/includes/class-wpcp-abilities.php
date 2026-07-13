<?php
/**
 * Optional WordPress 6.9+ Abilities API discovery layer.
 *
 * @package WPChatGPTPublisher
 */

defined( 'ABSPATH' ) || exit;

/**
 * Registers optional WordPress 6.9 Abilities API discovery metadata.
 */
final class WPCP_Abilities {
	/** Register Abilities API and native SEO metadata hooks. */
	public static function register_hooks(): void {
		add_action( 'init', array( 'WPCP_SEO', 'register_meta' ) );
		if ( function_exists( 'wp_register_ability' ) ) {
			add_action( 'wp_abilities_api_categories_init', array( __CLASS__, 'category' ) );
			add_action( 'wp_abilities_api_init', array( __CLASS__, 'abilities' ) ); }
	}
	/** Register the plugin ability category. */
	public static function category(): void {
		wp_register_ability_category(
			'editorial-publisher-for-chatgpt',
			array(
				'label'       => __( 'Editorial Publisher for ChatGPT', 'editorial-publisher-for-chatgpt' ),
				'description' => __( 'Discoverable editorial operations implemented by Editorial Publisher for ChatGPT.', 'editorial-publisher-for-chatgpt' ),
			)
		); }
	/** Register read-only plugin abilities. */
	public static function abilities(): void {
		wp_register_ability(
			'wp-chatgpt-publisher/site-info',
			array(
				'label'               => __( 'Read publisher site information', 'editorial-publisher-for-chatgpt' ),
				'description'         => __( 'Returns compact site compatibility information.', 'editorial-publisher-for-chatgpt' ),
				'category'            => 'editorial-publisher-for-chatgpt',
				'output_schema'       => array( 'type' => 'object' ),
				'execute_callback'    => static fn(): array => array(
					'name'          => get_bloginfo( 'name' ),
					'url'           => home_url( '/' ),
					'version'       => get_bloginfo( 'version' ),
					'pluginVersion' => WPCP_VERSION,
				),
				'permission_callback' => static fn(): bool => current_user_can( 'read' ),
				'meta'                => array(
					'show_in_rest' => true,
					'readonly'     => true,
				),
			)
		);
	}
}
