/** Prevent account A from loading account B's local projects in the same app.
 * This is UI-level separation, not encryption of files at rest.
 */
const AUTH_SESSION_KEY = 'ironlab.auth.session.v1';
const LEGACY_KEYS = [
  'ftc-electrical-lab-project',
  'ironlab-project-library-v1',
  'ftc-electrical-lab-sessions-v021',
] as const;

export function getLocalAccountId(): string | null {
  try {
    const session: unknown = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || 'null');
    if (!session || typeof session !== 'object') return null;
    const userId = (session as { user?: { id?: unknown } }).user?.id;
    return typeof userId === 'string' &&
      /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(userId)
      ? userId.toLowerCase() : null;
  } catch { return null; }
}

export function scopedStorageKey(baseKey: string): string {
  const userId = getLocalAccountId();
  return userId ? `${baseKey}:user:${userId}` : `${baseKey}:unauthenticated`;
}

/**
 * Legacy unscoped workspace data is only migrated after the owner account has
 * been verified online. Never auto-import a former user's data into a new
 * member account. Copy before removing the legacy item to avoid data loss.
 */
export function migrateLegacyOwnerStorage(userId: string): void {
  if (getLocalAccountId() !== userId.toLowerCase()) return;
  for (const key of LEGACY_KEYS) {
    const legacy = localStorage.getItem(key);
    if (legacy === null) continue;
    const scoped = scopedStorageKey(key);
    const existing = localStorage.getItem(scoped);
    if (existing === null) localStorage.setItem(scoped, legacy);
    if (localStorage.getItem(scoped) === legacy) localStorage.removeItem(key);
  }
}
