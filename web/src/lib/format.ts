export const shortHash = (hash?: string | null, head = 10, tail = 6) =>
  !hash ? '-' : hash.length <= head + tail + 1 ? hash : `${hash.slice(0, head)}…${hash.slice(-tail)}`;

export function when(iso?: string | null): string {
  if (!iso) return '-';
  const date = new Date(iso);
  return date.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export function ago(iso?: string | null): string {
  if (!iso) return '-';
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  const units: [number, string][] = [[86400, 'd'], [3600, 'h'], [60, 'm']];
  for (const [size, label] of units) if (Math.abs(seconds) >= size) return `${Math.round(seconds / size)}${label} ago`;
  return 'just now';
}

export const SENSITIVITY = [
  { level: 0, label: 'Public', chip: 'n' },
  { level: 1, label: 'Internal', chip: 'n' },
  { level: 2, label: 'Restricted', chip: 'a' },
  { level: 3, label: 'Confidential', chip: 'warn' },
  { level: 4, label: 'Sealed', chip: 'seal' },
] as const;

export const sensitivity = (level: number) => SENSITIVITY[level] ?? SENSITIVITY[2];

export const bytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

export const initials = (name: string) =>
  name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');

export function deadlineTone(percentElapsed: number): 'ok' | 'warn' | 'danger' {
  if (percentElapsed >= 1) return 'danger';
  if (percentElapsed >= 0.8) return 'warn';
  return 'ok';
}

/**
 * The API clamps percentElapsed at 1.5, so every breached deadline reports the
 * same "150%" regardless of how far past due it actually is. Printing that
 * number reads as a measurement when it is really a ceiling - and the Due column
 * already gives the honest figure in days. So past 100% we name the state
 * instead of restating a capped ratio.
 */
export const elapsedLabel = (percentElapsed: number) =>
  percentElapsed >= 1 ? 'Breached' : `${Math.round(percentElapsed * 100)}% elapsed`;
