import { GoogleSignin } from '@react-native-google-signin/google-signin';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signOut,
} from '@react-native-firebase/auth';
import { env } from '@/config/env';

export async function firebaseIdTokenFromGoogle(): Promise<string> {
  if (!env.googleWebClientId) throw new Error('Chưa cấu hình EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.');
  GoogleSignin.configure({ webClientId: env.googleWebClientId });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  const googleIdToken = result.data?.idToken;
  if (!googleIdToken) throw new Error('Google chưa trả ID token.');
  const credential = GoogleAuthProvider.credential(googleIdToken);
  const firebaseUser = await signInWithCredential(getAuth(), credential);
  return firebaseUser.user.getIdToken(true);
}

export async function clearGoogleIdentity(): Promise<void> {
  try {
    await signOut(getAuth());
  } catch {}
  try {
    await GoogleSignin.signOut();
  } catch {}
}
