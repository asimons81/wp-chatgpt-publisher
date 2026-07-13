<?php
/** PHPUnit bootstrap for pure plugin units and WordPress integration harness. */
define( 'WPCP_TESTING', true );
if ( getenv( 'WP_TESTS_DIR' ) && file_exists( getenv( 'WP_TESTS_DIR' ) . '/includes/functions.php' ) ) { require_once getenv( 'WP_TESTS_DIR' ) . '/includes/functions.php'; tests_add_filter( 'muplugins_loaded', static function (): void { require dirname( __DIR__, 2 ) . '/wordpress/editorial-publisher-for-chatgpt/editorial-publisher-for-chatgpt.php'; } ); require getenv( 'WP_TESTS_DIR' ) . '/includes/bootstrap.php'; }
