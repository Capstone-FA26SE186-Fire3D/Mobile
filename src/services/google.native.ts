import { GoogleSignin, isCancelledResponse } from '@react-native-google-signin/google-signin';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signOut,
} from '@react-native-firebase/auth';
import { env } from '@/config/env';
import { GoogleSignInCancelled } from '@/features/auth/google-errors';

export async function firebaseIdTokenFromGoogle(): Promise<string> {
  if (!env.googleWebClientId) throw new Error('Chưa cấu hình EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.');
  GoogleSignin.configure({ webClientId: env.googleWebClientId });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  // Closing the account picker is not an error ("Google chưa trả ID token" used to show).
  if (isCancelledResponse(result)) throw new GoogleSignInCancelled();
  const googleIdToken = result.data?.idToken;
  if (!googleIdToken) throw new Error('Google chưa trả ID token.');
  const credential = GoogleAuthProvider.credential(googleIdToken);
  const firebaseUser = await signInWithCredential(getAuth(), credential);
  // The token was issued by this sign-in a moment ago: no forced refresh, which cost a second round trip to Google
  // (about 29 s on a slow first attempt on the test phone, 15/11/2026).
  return firebaseUser.user.getIdToken();
}

export async function clearGoogleIdentity(): Promise<void> {
  try {
    await signOut(getAuth());
  } catch {}
  try {
    await GoogleSignin.signOut();
  } catch {}
}
