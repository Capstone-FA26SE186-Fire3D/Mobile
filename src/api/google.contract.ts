import type { ApiRequestOptions } from './types/common';

type Request = (path: string, options: ApiRequestOptions) => Promise<unknown>;

export type Fire3DAuthentication = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: string };
};

export function traineeUsername(value: string): string {
  const username = value.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    throw new Error(
      'Username cần 3–30 ký tự: chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.',
    );
  }
  return username;
}

export function parseGoogleExchange(
  value: unknown,
):
  | { status: 'Authenticated'; authentication: Fire3DAuthentication }
  | { status: 'OnboardingRequired'; onboardingToken: string } {
  if (!value || typeof value !== 'object')
    throw new Error('Google exchange trả dữ liệu không hợp lệ.');
  const item = value as Record<string, unknown>;
  if (
    item.status === 'OnboardingRequired' &&
    typeof item.onboardingToken === 'string' &&
    item.onboardingToken
  ) {
    return { status: 'OnboardingRequired', onboardingToken: item.onboardingToken };
  }
  if (
    item.status === 'Authenticated' &&
    item.authentication &&
    typeof item.authentication === 'object'
  ) {
    const authentication = item.authentication as Record<string, unknown>;
    const user = authentication.user as Record<string, unknown> | undefined;
    if (
      typeof authentication.accessToken === 'string' &&
      authentication.accessToken &&
      typeof authentication.refreshToken === 'string' &&
      authentication.refreshToken &&
      user &&
      typeof user.id === 'string' &&
      typeof user.email === 'string' &&
      user.role === 'Trainee'
    ) {
      return { status: 'Authenticated', authentication: authentication as Fire3DAuthentication };
    }
  }
  throw new Error('Google exchange trả dữ liệu không hợp lệ hoặc tài khoản không thuộc Trainee.');
}

export async function exchangeFirebaseToken(request: Request, idToken: string) {
  return parseGoogleExchange(await request('/api/auth/login-firebase', { json: idToken }));
}

export async function completeGoogleTrainee(
  request: Request,
  onboardingToken: string,
  username: string,
) {
  return parseGoogleExchange(
    await request('/api/auth/google/onboarding/complete', {
      json: { onboardingToken, accountType: 'trainee', username: traineeUsername(username) },
    }),
  );
}

export function linkGoogleAccount(request: Request, idToken: string, currentPassword: string) {
  return request('/api/me/link-google', { json: { idToken, currentPassword } });
}
