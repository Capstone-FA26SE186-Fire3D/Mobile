/** Whether a local launch row belongs to the signed-in account. Rows from before migration 2 have no account and are
 * Trainee training sessions. Pure: unit-tested with `node --test`. */
export function launchBelongsTo(
  launch: { account_id: string | null; kind: string } | null | undefined,
  accountId: string | null | undefined,
  includeLegacy: boolean,
): boolean {
  if (!launch || !accountId) return false;
  return launch.account_id == null
    ? includeLegacy && launch.kind === 'Training'
    : launch.account_id === accountId;
}
