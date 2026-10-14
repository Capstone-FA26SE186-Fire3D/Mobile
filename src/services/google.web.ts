export async function firebaseIdTokenFromGoogle(): Promise<string> {
  throw new Error('Google Sign-In chỉ khả dụng trong Android development build.');
}
export async function clearGoogleIdentity(): Promise<void> {}
