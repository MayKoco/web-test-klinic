const RESERVED_HOST_LABELS = new Set(["www", "app", "admin", "api"]);

export function clinicSubdomainFromHostname(
  hostname: string,
  baseDomain = process.env.NEXT_PUBLIC_CLINIC_BASE_DOMAIN ?? "lvh.me",
) {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  const bases = Array.from(new Set([baseDomain, "lvh.me", "localhost"]));

  for (const base of bases) {
    const suffix = `.${base.toLowerCase()}`;
    if (!host.endsWith(suffix)) continue;
    const label = host.slice(0, -suffix.length);
    if (
      !label ||
      label.includes(".") ||
      RESERVED_HOST_LABELS.has(label) ||
      !/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(label)
    ) {
      return null;
    }
    return label;
  }
  return null;
}
