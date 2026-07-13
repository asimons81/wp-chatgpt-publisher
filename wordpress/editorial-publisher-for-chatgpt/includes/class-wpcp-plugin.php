<?php
/**
 * Plugin coordinator.
 *
 * @package WPChatGPTPublisher
 */

defined( 'ABSPATH' ) || exit;

/**
 * Coordinates plugin hooks and service objects.
 */
final class WPCP_Plugin {
	/**
	 * Singleton plugin instance.
	 *
	 * @var WPCP_Plugin|null
	 */
	private static ?WPCP_Plugin $instance = null;

	/** Return the singleton plugin coordinator. */
	public static function instance(): WPCP_Plugin {
		if ( null === self::$instance ) {
			self::$instance = new self(); }
		return self::$instance;
	}
	/** Register runtime hooks. */
	public function register(): void {
		add_action( 'rest_api_init', array( new WPCP_REST_Controller(), 'register_routes' ) );
		if ( is_admin() ) {
			( new WPCP_Admin() )->register(); }
		WPCP_Abilities::register_hooks();
		add_action( 'wpcp_daily_cleanup', array( 'WPCP_DB', 'cleanup' ) );
	}
	/** Prevent direct construction. */
	private function __construct() {}
}
