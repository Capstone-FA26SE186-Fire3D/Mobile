import { requestWithSession } from './auth';

export type BuildingQrResolution = {
  buildingId: string;
  buildingName: string;
  visibility: string;
  hasAccess: boolean;
  serviceStatus: 'Active' | 'Expired' | 'NotPurchased';
  serviceEndsAt: string | null;
  canStartNewSessions: boolean;
};

export type Training = {
  id: string;
  releaseId: string;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  allowedModes: string[];
  createdAt: string;
  releaseStatus: string | null;
  scenarioVersionId: string | null;
  reviewStatus: string;
};

export function resolveBuildingQr(token: string): Promise<BuildingQrResolution> {
  return requestWithSession(`/api/qr/${encodeURIComponent(token)}`);
}

export function getQrTrainings(token: string): Promise<Training[]> {
  return requestWithSession(`/api/qr/${encodeURIComponent(token)}/trainings`);
}

export function verifyParticipationCode(buildingId: string, code: string): Promise<void> {
  return requestWithSession(
    `/api/buildings/${encodeURIComponent(buildingId)}/participation/verify`,
    {
      json: { code },
    },
  );
}
