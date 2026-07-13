<?php
/**
 * Plugin Name:       Editorial Publisher for ChatGPT
 * Plugin URI:        https://github.com/asimons81/wp-chatgpt-publisher
 * Description:       Securely manage WordPress editorial workflows from ChatGPT without an OpenAI API key or separate API bill.
 * Version:           1.0.1
 * Requires at least: 6.9
 * Requires PHP:      8.1
 * Author:            Editorial Publisher for ChatGPT contributors
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       editorial-publisher-for-chatgpt
 *
 * @package WPChatGPTPublisher
 */

defined( 'ABSPATH' ) || exit;

define( 'WPCP_VERSION', '1.0.1' );
define( 'WPCP_FILE', __FILE__ );
define( 'WPCP_DIR', plugin_dir_path( __FILE__ ) );
define( 'WPCP_URL', plugin_dir_url( __FILE__ ) );

require_once WPCP_DIR . 'includes/class-wpcp-db.php';
require_once WPCP_DIR . 'includes/class-wpcp-scopes.php';
require_once WPCP_DIR . 'includes/class-wpcp-auth.php';
require_once WPCP_DIR . 'includes/class-wpcp-audit.php';
require_once WPCP_DIR . 'includes/class-wpcp-markdown.php';
require_once WPCP_DIR . 'includes/class-wpcp-secret.php';
require_once WPCP_DIR . 'includes/interface-wpcp-seo-adapter.php';
require_once WPCP_DIR . 'includes/class-wpcp-seo-meta-adapter.php';
require_once WPCP_DIR . 'includes/class-wpcp-seo-native.php';
require_once WPCP_DIR . 'includes/class-wpcp-seo-yoast.php';
require_once WPCP_DIR . 'includes/class-wpcp-seo-rankmath.php';
require_once WPCP_DIR . 'includes/class-wpcp-seo-aioseo.php';
require_once WPCP_DIR . 'includes/class-wpcp-seo.php';
require_once WPCP_DIR . 'includes/class-wpcp-rest-schema.php';
require_once WPCP_DIR . 'includes/class-wpcp-rest-controller.php';
require_once WPCP_DIR . 'includes/class-wpcp-admin.php';
require_once WPCP_DIR . 'includes/class-wpcp-abilities.php';
require_once WPCP_DIR . 'includes/class-wpcp-plugin.php';

register_activation_hook( __FILE__, array( 'WPCP_DB', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'WPCP_DB', 'deactivate' ) );

add_action(
	'plugins_loaded',
	static function (): void {
		WPCP_DB::maybe_upgrade();
		WPCP_Plugin::instance()->register();
	}
);
