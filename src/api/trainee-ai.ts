import * as Crypto from 'expo-crypto';
import { requestWithSession } from './auth';

export type AiContext =
  | { kind: 'Learn'; postId: string; versionId: string }
  | { kind: 'Training'; trainingId: string }
  | { kind: 'Result'; sessionId: string };

export type AiQuota = {
  policyActive: boolean;
  quotaUnit: string | null;
  dailyUnits: number | null;
  usedUnits: number;
  reservedUnits: number;
  remainingUnits: number;
  estimatedReserve: number | null;
  maxInputChars: number | null;
  resetsAt: string;
  blockedByAssessment: boolean;
  canSubmit: boolean;
};

export type AiRequest = {
  requestId: string;
  status: 'Accepted' | 'Processing' | 'Succeeded' | 'Failed' | 'NeedsReconcile';
  resultType: string | null;
  input: { text: string; context: AiContext | null };
  result: { status: string; answer: string | null; message: string | null } | null;
  citations: {
    title: string;
    locator: string | null;
    link: { learnSlug: string | null; sourceUri: string | null };
  }[];
  failureCode: string | null;
  resultWithheld: boolean | null;
  createdAt: string;
};

export type AiRequestPage = { items: AiRequest[]; total: number; page: number; pageSize: number };

export function getAiQuota(): Promise<AiQuota> {
  return requestWithSession('/api/ai/trainee/quota');
}

export function listAiRequests(page = 1): Promise<AiRequestPage> {
  return requestWithSession('/api/ai/trainee/requests', { query: { page, pageSize: 20 } });
}

export function getAiRequest(id: string): Promise<AiRequest> {
  return requestWithSession(`/api/ai/trainee/requests/${encodeURIComponent(id)}`);
}

export function submitAiQuestion(
  question: string,
  context?: AiContext,
  key = Crypto.randomUUID(),
): Promise<AiRequest> {
  return requestWithSession('/api/ai/trainee/answer', {
    headers: { 'Idempotency-Key': key },
    json: { question, context },
  });
}
