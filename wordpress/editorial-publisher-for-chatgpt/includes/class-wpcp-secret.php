<?php
/**
 * Local credential envelope encryption.
 *
 * @package WPChatGPTPublisher
 */

defined( 'ABSPATH' ) || exit;

/**
 * Encrypts the short-lived connection credential before transient storage.
 */
final class WPCP_Secret {
	/**
	 * Derive the site-local encryption key.
	 */
	private static function key(): string {
		return hash( 'sha256', wp_salt( 'secure_auth' ), true );
	}

	/**
	 * Encrypt a value with authenticated context binding.
	 *
	 * @param string $plaintext Secret value.
	 * @param string $context   Connection identifier.
	 * @throws RuntimeException When Sodium is unavailable.
	 */
	public static function encrypt( string $plaintext, string $context ): string {
		if ( ! function_exists( 'sodium_crypto_aead_xchacha20poly1305_ietf_encrypt' ) ) {
			throw new RuntimeException( 'Credential encryption requires the PHP Sodium extension.' );
		}
		$nonce      = random_bytes( SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_NPUBBYTES );
		$ciphertext = sodium_crypto_aead_xchacha20poly1305_ietf_encrypt( $plaintext, $context, $nonce, self::key() );
		return '2.' . self::encode( $nonce ) . '.' . self::encode( $ciphertext );
	}

	/**
	 * Decrypt a context-bound credential envelope.
	 *
	 * @param string $envelope Encrypted envelope.
	 * @param string $context  Connection identifier.
	 * @throws RuntimeException When the envelope is invalid or cannot be decrypted.
	 */
	public static function decrypt( string $envelope, string $context ): string {
		$parts = explode( '.', $envelope );
		if ( 3 !== count( $parts ) || '2' !== $parts[0] ) {
			throw new RuntimeException( 'Credential envelope is invalid.' );
		}
		if ( ! function_exists( 'sodium_crypto_aead_xchacha20poly1305_ietf_decrypt' ) ) {
			throw new RuntimeException( 'Credential decryption requires the PHP Sodium extension.' );
		}
		$plaintext = sodium_crypto_aead_xchacha20poly1305_ietf_decrypt( self::decode( $parts[2] ), $context, self::decode( $parts[1] ), self::key() );
		if ( false === $plaintext ) {
			throw new RuntimeException( 'Credential decryption failed.' );
		}
		return $plaintext;
	}

	/**
	 * Encode binary envelope data as URL-safe base64.
	 *
	 * @param string $value Binary value.
	 */
	private static function encode( string $value ): string {
		return rtrim( strtr( base64_encode( $value ), '+/', '-_' ), '=' ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- Standard authenticated-encryption envelope encoding.
	}

	/**
	 * Decode URL-safe base64 envelope data.
	 *
	 * @param string $value Encoded value.
	 * @throws RuntimeException When the envelope encoding is invalid.
	 */
	private static function decode( string $value ): string {
		$value  .= str_repeat( '=', ( 4 - strlen( $value ) % 4 ) % 4 );
		$decoded = base64_decode( strtr( $value, '-_', '+/' ), true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode -- Standard authenticated-encryption envelope decoding.
		if ( false === $decoded ) {
			throw new RuntimeException( 'Credential envelope encoding is invalid.' );
		}
		return $decoded;
	}
}
