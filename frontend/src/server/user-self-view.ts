/**
 * Columns of `users` that only admins see (or nobody: the two-step secret).
 * They are left out of what a user gets back about themselves (/api/users/me
 * and the login response), and never appear on public profiles.
 */
export const ADMIN_ONLY_USER_COLUMNS = [
  "password_hash",
  "background_check_note",
  "ptin",
  "ptin_note",
  "ptin_recorded_by",
  "tax_credential_note",
  "tax_credential_recorded_by",
  // Two-step sign-in's sealed secret and replay counter are never sent to anyone.
  "totp_secret_enc",
  "totp_last_step",
] as const;

type AdminOnly = (typeof ADMIN_ONLY_USER_COLUMNS)[number];

/**
 * A `SELECT * FROM users` row as the user may see it: the admin-only columns
 * removed, and `has_ptin` in place of the PTIN itself.
 */
export function userSelfView<T extends Record<string, unknown>>(
  row: T,
): Omit<T, AdminOnly> & { has_ptin: boolean } {
  const out: Record<string, unknown> = { ...row, has_ptin: row.ptin != null };
  for (const col of ADMIN_ONLY_USER_COLUMNS) delete out[col];
  return out as Omit<T, AdminOnly> & { has_ptin: boolean };
}
