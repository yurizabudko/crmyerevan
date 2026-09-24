/** Типы событий журнала администрирования (раздел 7.4). */
export const AUDIT_EVENTS = [
  'auth.login',
  'auth.login_failed',
  'auth.logout',
  'auth.password_changed',
  'user.created',
  'user.blocked',
  'user.unblocked',
  'user.password_reset',
  'user.permissions_changed',
  'listing.created',
  'listing.deleted',
  'client.created',
  'client.deleted',
  'deal.closed',
  'reward.accrued',
] as const;
export type AuditEventType = (typeof AUDIT_EVENTS)[number];
