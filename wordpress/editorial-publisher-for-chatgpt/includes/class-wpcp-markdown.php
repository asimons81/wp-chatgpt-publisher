<?php
/**
 * Conservative Markdown conversion.
 *
 * @package WPChatGPTPublisher
 */

defined( 'ABSPATH' ) || exit;

/**
 * Converts a conservative Markdown subset to blocks and back.
 */
final class WPCP_Markdown {
	/**
	 * Convert Markdown input into valid core block markup.
	 *
	 * @param string $markdown Markdown source.
	 */
	public static function to_blocks( string $markdown ): string {
		$lines = preg_split( '/\R/', str_replace( array( "\r\n", "\r" ), "\n", $markdown ) );
		if ( ! is_array( $lines ) ) {
			return ''; }
		$blocks          = array();
		$paragraph       = array();
		$list            = array();
		$code            = array();
		$in_code         = false;
		$flush_paragraph = static function () use ( &$paragraph, &$blocks ): void {
			if ( 0 < count( $paragraph ) ) {
				$html      = wp_kses_post( self::inline( implode( ' ', $paragraph ) ) );
				$blocks[]  = "<!-- wp:paragraph -->\n<p>$html</p>\n<!-- /wp:paragraph -->";
				$paragraph = array();
			} };
		$flush_list      = static function () use ( &$list, &$blocks ): void {
			if ( 0 < count( $list ) ) {
				$items    = implode( '', array_map( static fn( string $item ): string => '<li>' . wp_kses_post( self::inline( $item ) ) . '</li>', $list ) );
				$blocks[] = "<!-- wp:list -->\n<ul>$items</ul>\n<!-- /wp:list -->";
				$list     = array();
			} };
		foreach ( $lines as $line ) {
			if ( str_starts_with( trim( $line ), '```' ) ) {
				$flush_paragraph();
				$flush_list();
				if ( $in_code ) {
					$escaped  = esc_html( implode( "\n", $code ) );
					$blocks[] = "<!-- wp:code -->\n<pre class=\"wp-block-code\"><code>$escaped</code></pre>\n<!-- /wp:code -->";
					$code     = array();
				} $in_code = ! $in_code;
				continue; }
			if ( $in_code ) {
				$code[] = $line;
				continue; }
			if ( preg_match( '/^(#{1,6})\s+(.+)$/', $line, $heading ) ) {
				$flush_paragraph();
				$flush_list();
				$level    = strlen( $heading[1] );
				$value    = wp_kses_post( self::inline( $heading[2] ) );
				$blocks[] = "<!-- wp:heading {\"level\":$level} -->\n<h$level>$value</h$level>\n<!-- /wp:heading -->";
				continue; }
			if ( preg_match( '/^[-*+]\s+(.+)$/', $line, $item ) ) {
				$flush_paragraph();
				$list[] = $item[1];
				continue; }
			if ( preg_match( '/^>\s?(.*)$/', $line, $quote ) ) {
				$flush_paragraph();
				$flush_list();
				$value    = wp_kses_post( self::inline( $quote[1] ) );
				$blocks[] = "<!-- wp:quote -->\n<blockquote class=\"wp-block-quote\"><p>$value</p></blockquote>\n<!-- /wp:quote -->";
				continue; }
			if ( '' === trim( $line ) ) {
				$flush_paragraph();
				$flush_list();
			} else {
				$paragraph[] = trim( $line ); }
		}
		$flush_paragraph();
		$flush_list();
		if ( $code ) {
			$escaped  = esc_html( implode( "\n", $code ) );
			$blocks[] = "<!-- wp:code -->\n<pre class=\"wp-block-code\"><code>$escaped</code></pre>\n<!-- /wp:code -->"; }
		return implode( "\n\n", $blocks );
	}
	/**
	 * Convert safe inline Markdown spans.
	 *
	 * @param string $value Inline Markdown source.
	 */
	private static function inline( string $value ): string {
		$value = esc_html( $value );
		$value = preg_replace( '/\*\*(.+?)\*\*/', '<strong>$1</strong>', $value );
		$value = preg_replace( '/(?<!\*)\*([^*]+)\*/', '<em>$1</em>', (string) $value );
		return (string) preg_replace_callback( '/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/', static fn( array $matches ): string => '<a href="' . esc_url( $matches[2] ) . '">' . esc_html( $matches[1] ) . '</a>', (string) $value );
	}
	/**
	 * Convert stored blocks into compact, model-friendly Markdown.
	 *
	 * @param string $content Stored block content.
	 */
	public static function to_markdown( string $content ): string {
		$blocks = parse_blocks( $content );
		if ( empty( $blocks ) ) {
			return trim( wp_strip_all_tags( $content ) ); }
		$output = '';
		foreach ( $blocks as $block ) {
			$name       = (string) ( $block['blockName'] ?? '' );
			$inner      = (string) ( $block['innerHTML'] ?? '' );
			$plain      = trim( html_entity_decode( wp_strip_all_tags( $inner ), ENT_QUOTES | ENT_HTML5, 'UTF-8' ) );
			$list_items = preg_split( '/<li[^>]*>/', $inner );
			$output    .= match ( $name ) {
				'core/heading' => str_repeat( '#', (int) ( $block['attrs']['level'] ?? 2 ) ) . ' ' . $plain,
				'core/quote' => '> ' . str_replace( "\n", "\n> ", $plain ),
				'core/code' => "```\n$plain\n```",
				'core/list' => implode( "\n", array_map( static fn( string $item ): string => '- ' . trim( wp_strip_all_tags( $item ) ), false === $list_items ? array() : $list_items ) ),
				default => '' !== $plain ? $plain : trim( wp_strip_all_tags( serialize_block( $block ) ) ),
			} . "\n\n"; }
		return trim( $output );
	}
}
