import type { ApiRequestOptions } from '../api/types/common';

type Request = (path: string, options: ApiRequestOptions) => Promise<unknown>;
export type Installation = { deviceUuid: string; installationKey: string };

export async function putDeviceBinding(
  request: Request,
  installation: Installation,
  fcmToken: string,
  osVersion: string,
  appVersion: string,
): Promise<void> {
  if (!fcmToken || /\s/.test(fcmToken)) throw new Error('FCM device token không hợp lệ.');
  if (!appVersion) throw new Error('Không đọc được phiên bản ứng dụng.');
  await request('/api/auth/devices', {
    method: 'PUT',
    headers: { 'X-Installation-Key': installation.installationKey },
    json: { deviceUuid: installation.deviceUuid, fcmToken, osVersion, appVersion },
  });
}

export async function deleteDeviceBinding(
  request: Request,
  installation: Installation,
): Promise<void> {
  await request(`/api/auth/devices/${encodeURIComponent(installation.deviceUuid)}`, {
    method: 'DELETE',
    headers: { 'X-Installation-Key': installation.installationKey },
  });
}
