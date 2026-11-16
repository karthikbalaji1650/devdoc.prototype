/** Names that read badly when split from camelCase. */
const LABELS: Record<string, string> = { sha256: 'SHA-256', commitSha: 'Commit SHA', imageName: 'Image name' };

/** "testRunIds" -> "Test run ids". */
const labelOf = (key: string): string => {
  if (LABELS[key]) return LABELS[key];
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const valueOf = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.length ? value.map(valueOf).join(', ') : 'none';
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([k, v]) => `${k}: ${valueOf(v)}`).join(' · ');
  }
  return String(value);
};

/** An audit entry's details as label / value pairs for display. */
export const formatAuditDetails = (details: Record<string, unknown>): { label: string; value: string }[] =>
  Object.entries(details).map(([key, value]) => ({ label: labelOf(key), value: valueOf(value) }));
