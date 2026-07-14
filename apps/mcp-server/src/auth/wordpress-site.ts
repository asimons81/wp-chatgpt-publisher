export function canonicalWordPressSiteUrl(siteUrl: string, linkHeader: string | null): string {
  const restRoot = linkHeader?.match(
    /<([^>]+)>\s*;\s*rel=(?:"https:\/\/api\.w\.org\/"|https:\/\/api\.w\.org\/)/i,
  )?.[1];
  if (!restRoot) return siteUrl;
  try {
    const canonical = new URL(restRoot);
    const suffix = "wp-json/";
    if (!canonical.pathname.endsWith(suffix)) return siteUrl;
    canonical.pathname = canonical.pathname.slice(0, -suffix.length);
    canonical.search = "";
    canonical.hash = "";
    return canonical.toString().replace(/\/$/, "");
  } catch {
    return siteUrl;
  }
}
