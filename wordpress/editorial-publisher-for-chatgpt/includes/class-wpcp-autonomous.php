<?php
/**
 * Autonomous editorial policy surface (ADR 0006 / ADR 0007).
 *
 * @package WPChatGPTPublisher
 */

defined( 'ABSPATH' ) || exit;

/**
 * Reads and strictly validates the autonomous site policy option, computes
 * the deterministic policy fingerprint, and evaluates the site-layer policy
 * gates that both autonomous REST routes share.
 *
 * Fail-closed rules (ADR 0006 §9, mirrored from the server validator):
 *  - a missing, malformed, or unknown-field policy is treated as disabled;
 *  - the kill switch (enabled=false) is checked first on every call;
 *  - a pipeline is allowed only when the policy names its id AND the
 *    manifest pipelineVersion satisfies minPipelineVersion;
 *  - defaults are materialized before fingerprinting so the digest is
 *    stable across key orderings and whitespace.
 */
final class WPCP_Autonomous {
	public const POLICY_OPTION         = 'wpcp_autonomous_policy';
	public const POLICY_SCHEMA_VERSION = 1;
	public const SCOPE                 = 'autonomous:execute';
	public const CAPABILITY            = 'publish_posts';
	public const INTENTS               = array( 'create_draft', 'schedule_draft' );
	public const ACTION_EXECUTE        = 'autonomous_execute';
	public const ACTION_VALIDATE       = 'autonomous_validate';

	/**
	 * Read and parse the site policy at call time.
	 *
	 * The option is read on every validate/execute call so a stale policy
	 * cannot be cached (ADR 0006 §3). A missing or invalid policy yields
	 * nulls, which callers must treat as disabled.
	 *
	 * @return array{policy: array<string,mixed>|null, fingerprint: string|null}
	 */
	public static function read_policy(): array {
		$raw    = get_option( self::POLICY_OPTION, null );
		$policy = self::parse_policy( $raw );
		if ( null === $policy ) {
			return array(
				'policy'      => null,
				'fingerprint' => null,
			);
		}
		return array(
			'policy'      => $policy,
			'fingerprint' => self::fingerprint( $policy ),
		);
	}

	/**
	 * Strictly parse the site policy option value, fail closed.
	 *
	 * Accepts either the raw JSON string or an already-decoded array. Any
	 * unknown field, wrong schemaVersion, non-boolean enabled, or malformed
	 * pipeline descriptor makes the whole policy unusable (null), which
	 * every caller maps to autonomous_disabled — never to a default-open
	 * state.
	 *
	 * @param mixed $raw Raw option value (string JSON, array, or null).
	 * @return array<string,mixed>|null Normalized policy with defaults materialized.
	 */
	public static function parse_policy( $raw ): ?array {
		if ( null === $raw || false === $raw || '' === $raw ) {
			return null;
		}
		if ( is_string( $raw ) ) {
			$decoded = json_decode( $raw, true );
			if ( ! is_array( $decoded ) ) {
				return null;
			}
			$raw = $decoded;
		}
		if ( ! is_array( $raw ) ) {
			return null;
		}
		$unknown = array_diff( array_keys( $raw ), array( 'schemaVersion', 'enabled', 'allowedPipelines' ) );
		if ( $unknown ) {
			return null;
		}
		if ( ! isset( $raw['schemaVersion'] ) || self::POLICY_SCHEMA_VERSION !== $raw['schemaVersion'] ) {
			return null;
		}
		$enabled = array_key_exists( 'enabled', $raw ) ? $raw['enabled'] : false;
		if ( ! is_bool( $enabled ) ) {
			return null;
		}
		$pipelines = array_key_exists( 'allowedPipelines', $raw ) ? $raw['allowedPipelines'] : array();
		if ( ! is_array( $pipelines ) ) {
			return null;
		}
		$normalized = array();
		foreach ( $pipelines as $entry ) {
			$pipeline = self::parse_pipeline_policy( $entry );
			if ( null === $pipeline ) {
				return null;
			}
			$normalized[] = $pipeline;
		}
		return array(
			'schemaVersion'    => self::POLICY_SCHEMA_VERSION,
			'enabled'          => $enabled,
			'allowedPipelines' => $normalized,
		);
	}

	/**
	 * Strictly parse one allowed pipeline descriptor.
	 *
	 * Mirrors AutonomousPipelinePolicySchema: exactly pipelineId,
	 * minPipelineVersion, and limits are allowed; unknown fields reject the
	 * whole policy.
	 *
	 * @param mixed $raw Raw descriptor.
	 * @return array<string,mixed>|null
	 */
	public static function parse_pipeline_policy( $raw ): ?array {
		if ( ! is_array( $raw ) ) {
			return null;
		}
		$unknown = array_diff( array_keys( $raw ), array( 'pipelineId', 'minPipelineVersion', 'limits' ) );
		if ( $unknown ) {
			return null;
		}
		if ( ! isset( $raw['pipelineId'] ) || ! is_string( $raw['pipelineId'] ) || ! self::is_valid_pipeline_id( $raw['pipelineId'] ) ) {
			return null;
		}
		if ( ! isset( $raw['minPipelineVersion'] ) || ! is_string( $raw['minPipelineVersion'] ) || '' === $raw['minPipelineVersion'] || strlen( $raw['minPipelineVersion'] ) > 64 ) {
			return null;
		}
		$limits = self::parse_limits( array_key_exists( 'limits', $raw ) ? $raw['limits'] : null );
		if ( null === $limits ) {
			return null;
		}
		return array(
			'pipelineId'         => $raw['pipelineId'],
			'minPipelineVersion' => $raw['minPipelineVersion'],
			'limits'             => $limits,
		);
	}

	/**
	 * Strictly parse the rate limits object with Zod-compatible defaults.
	 *
	 * @param mixed $raw Raw limits value (null and empty arrays both default).
	 * @return array<string,int>|null
	 */
	public static function parse_limits( $raw ): ?array {
		$defaults = array(
			'maxRequestsPerHour' => 20,
			'maxRequestsPerDay'  => 100,
			'maxScheduledPerDay' => 20,
		);
		if ( null === $raw ) {
			$raw = array();
		}
		if ( ! is_array( $raw ) ) {
			return null;
		}
		$unknown = array_diff( array_keys( $raw ), array( 'maxRequestsPerHour', 'maxRequestsPerDay', 'maxScheduledPerDay' ) );
		if ( $unknown ) {
			return null;
		}
		$limits = array();
		foreach ( $defaults as $key => $fallback ) {
			$value = array_key_exists( $key, $raw ) ? $raw[ $key ] : $fallback;
			if ( ! is_int( $value ) ) {
				return null;
			}
			$max = match ( $key ) {
				'maxRequestsPerHour' => 1000,
				'maxRequestsPerDay'  => 10000,
				'maxScheduledPerDay' => 1000,
			};
			if ( $value < 1 || $value > $max ) {
				return null;
			}
			$limits[ $key ] = $value;
		}
		return $limits;
	}

	/**
	 * Evaluate the site-layer policy gates for one manifest claim.
	 *
	 * The kill switch is checked first (ADR 0006 §9.1/§9.7): a missing or
	 * disabled policy always reports autonomous_disabled, even when the
	 * manifest itself is well-formed and the pipeline would otherwise be
	 * allowed. Returns the ADR violation code, or null when the policy
	 * permits this pipeline at this version.
	 *
	 * @param array<string,mixed>|null $policy    Parsed policy or null when disabled.
	 * @param string                   $pipeline_id      Manifest pipeline id.
	 * @param string                   $pipeline_version Manifest pipeline version.
	 * @return string|null Violation code or null when permitted.
	 */
	public static function first_gate_violation( ?array $policy, string $pipeline_id, string $pipeline_version ): ?string {
		if ( null === $policy || empty( $policy['enabled'] ) ) {
			return 'autonomous_disabled';
		}
		if ( ! self::policy_allows_pipeline( $policy, $pipeline_id, $pipeline_version ) ) {
			$descriptor = self::find_pipeline( $policy, $pipeline_id );
			if ( null === $descriptor ) {
				return 'pipeline_not_allowed';
			}
			return 'pipeline_version_mismatch';
		}
		return null;
	}

	/**
	 * Return the policy descriptor for a pipeline id, if present.
	 *
	 * @param array<string,mixed> $policy      Parsed policy.
	 * @param string              $pipeline_id Pipeline id.
	 * @return array<string,mixed>|null
	 */
	public static function find_pipeline( array $policy, string $pipeline_id ): ?array {
		foreach ( (array) ( $policy['allowedPipelines'] ?? array() ) as $descriptor ) {
			if ( is_array( $descriptor ) && ( $descriptor['pipelineId'] ?? '' ) === $pipeline_id ) {
				return $descriptor;
			}
		}
		return null;
	}

	/**
	 * True when the policy names the pipeline and the version satisfies the
	 * configured minimum.
	 *
	 * @param array<string,mixed> $policy           Parsed policy.
	 * @param string              $pipeline_id      Pipeline id.
	 * @param string              $pipeline_version Pipeline version.
	 */
	public static function policy_allows_pipeline( array $policy, string $pipeline_id, string $pipeline_version ): bool {
		$descriptor = self::find_pipeline( $policy, $pipeline_id );
		if ( null === $descriptor ) {
			return false;
		}
		$minimum = is_string( $descriptor['minPipelineVersion'] ?? null ) ? $descriptor['minPipelineVersion'] : '';
		return '' !== $minimum && self::version_at_least( $pipeline_version, $minimum );
	}

	/**
	 * Deterministic SHA-256 fingerprint of the effective site policy.
	 *
	 * Computed over the canonical JSON of the parsed policy (defaults
	 * materialized, keys sorted recursively, no whitespace), so the digest
	 * is stable across key orderings and whitespace and changes exactly
	 * when the effective policy changes (ADR 0006 §3).
	 *
	 * @param array<string,mixed> $policy Parsed policy.
	 */
	public static function fingerprint( array $policy ): string {
		return hash( 'sha256', self::canonical_json( $policy ) );
	}

	/**
	 * Stable JSON serialization: recursively sorted object keys, no
	 * whitespace. Mirrors the server canonicalJson() (which uses
	 * JSON.stringify) so both layers produce byte-identical digests for
	 * the same policy: slashes and non-ASCII characters are never escaped
	 * (JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE).
	 *
	 * @param mixed $value Value to serialize.
	 */
	public static function canonical_json( $value ): string {
		$flags = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE;
		if ( is_array( $value ) && array_is_list( $value ) ) {
			$parts = array();
			foreach ( $value as $item ) {
				$parts[] = self::canonical_json( $item );
			}
			return '[' . implode( ',', $parts ) . ']';
		}
		if ( is_array( $value ) ) {
			$keys = array_keys( $value );
			sort( $keys, SORT_STRING );
			$parts = array();
			foreach ( $keys as $key ) {
				$parts[] = wp_json_encode( (string) $key, $flags ) . ':' . self::canonical_json( $value[ $key ] );
			}
			return '{' . implode( ',', $parts ) . '}';
		}
		$encoded = wp_json_encode( $value, $flags );
		return false === $encoded ? 'null' : $encoded;
	}

	/**
	 * Compare two dot-separated versions: true when version >= minimum.
	 *
	 * Mirrors the server versionAtLeast(): numeric segments compare
	 * numerically, a numeric segment outranks a non-numeric one at the same
	 * position (release > pre-release — the fail-closed direction), and two
	 * non-numeric segments compare lexically.
	 *
	 * @param string $version Claimed pipeline version.
	 * @param string $minimum Configured minimum.
	 */
	public static function version_at_least( string $version, string $minimum ): bool {
		$v      = explode( '.', $version );
		$m      = explode( '.', $minimum );
		$length = max( count( $v ), count( $m ) );
		for ( $index = 0; $index < $length; $index++ ) {
			$v_part    = $v[ $index ] ?? '0';
			$m_part    = $m[ $index ] ?? '0';
			$v_numeric = ctype_digit( $v_part );
			$m_numeric = ctype_digit( $m_part );
			if ( $v_numeric && $m_numeric ) {
				$v_num = (int) $v_part;
				$m_num = (int) $m_part;
				if ( $v_num !== $m_num ) {
					return $v_num > $m_num;
				}
			} elseif ( $v_numeric !== $m_numeric ) {
				return $v_numeric;
			} else {
				$comparison = strcmp( $v_part, $m_part );
				if ( 0 !== $comparison ) {
					return $comparison > 0;
				}
			}
		}
		return true;
	}

	/**
	 * True when the pipeline id matches the strict allowlist pattern.
	 *
	 * @param string $value Pipeline id.
	 */
	public static function is_valid_pipeline_id( string $value ): bool {
		return 1 === preg_match( '/^[a-z0-9][a-z0-9._-]*$/', $value ) && strlen( $value ) <= 128;
	}

	/**
	 * Apply the manifest defaults and the schedule refine, mirroring the
	 * Zod schema behavior that WP REST argument defaults cannot express.
	 *
	 * @param array<string,mixed> $manifest Manifest after REST arg validation.
	 * @return array<string,mixed>|WP_Error Normalized manifest or manifest_invalid.
	 */
	public static function normalize_manifest( array $manifest ) {
		$content                  = is_array( $manifest['content'] ?? null ) ? $manifest['content'] : array();
		$content['postType']      = isset( $content['postType'] ) ? $content['postType'] : 'post';
		$content['bodyFormat']    = isset( $content['bodyFormat'] ) ? $content['bodyFormat'] : 'markdown';
		$content['categories']    = isset( $content['categories'] ) ? $content['categories'] : array();
		$content['tags']          = isset( $content['tags'] ) ? $content['tags'] : array();
		$attestations             = is_array( $manifest['attestations'] ?? null ) ? $manifest['attestations'] : array();
		$research                 = is_array( $attestations['research'] ?? null ) ? $attestations['research'] : array();
		$research['sources']      = isset( $research['sources'] ) ? $research['sources'] : array();
		$attestations['research'] = $research;
		$qa                       = is_array( $attestations['qa'] ?? null ) ? $attestations['qa'] : array();
		$qa['checks']             = isset( $qa['checks'] ) ? $qa['checks'] : array();
		$attestations['qa']       = $qa;
		$manifest['content']      = $content;
		$manifest['attestations'] = $attestations;
		if ( 'schedule_draft' === $manifest['intent'] && ! isset( $manifest['schedule'] ) ) {
			return new WP_Error(
				'wpcp_manifest_invalid',
				__( 'schedule_draft requires a schedule.', 'editorial-publisher-for-chatgpt' ),
				array(
					'status' => 400,
					'code'   => 'manifest_invalid',
				)
			);
		}
		return $manifest;
	}

	/**
	 * Immutable request hash for the plugin idempotency reservation and
	 * audit trail: SHA-256 of canonical manifest + connection + policy
	 * fingerprint (ADR 0006 §6).
	 *
	 * @param array<string,mixed> $manifest           Normalized manifest.
	 * @param string              $connection_id      Connection id.
	 * @param string              $policy_fingerprint Effective policy fingerprint.
	 */
	public static function request_hash( array $manifest, string $connection_id, string $policy_fingerprint ): string {
		return hash( 'sha256', self::canonical_json( $manifest ) . '|' . $connection_id . '|' . $policy_fingerprint );
	}
}
