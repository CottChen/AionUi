export function formatSessionTimestamp(value?: string): string {
  if (!value) return '';
  const numeric = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  const date = new Date(Number.isFinite(numeric) ? numeric : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function formatStructuredValue(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
