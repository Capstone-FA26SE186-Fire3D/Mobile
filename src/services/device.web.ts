export async function bindDevice(_accountId: string): Promise<boolean> {
  return false;
}
export async function revokeDevice(_accountId: string): Promise<void> {}
export function listenForDeviceTokenChange(
  _accountId: string,
  _onError: (error: unknown) => void,
): () => void {
  return () => {};
}
