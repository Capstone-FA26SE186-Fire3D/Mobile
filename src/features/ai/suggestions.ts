import type { AiContext } from '../../api/trainee-ai';

type Params = { postId?: unknown; versionId?: unknown; sessionId?: unknown; trainingId?: unknown };

const text = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : null);

/** The one context a question is sent with, from the screen's route params: an article, a result, then a Training. */
export function aiContextFromParams(params: Params): AiContext | undefined {
  const postId = text(params.postId);
  const versionId = text(params.versionId);
  if (postId && versionId) return { kind: 'Learn', postId, versionId };
  const sessionId = text(params.sessionId);
  if (sessionId) return { kind: 'Result', sessionId };
  const trainingId = text(params.trainingId);
  if (trainingId) return { kind: 'Training', trainingId };
  return undefined;
}

/** Line under the header saying what the question is about. */
export function aiContextLabel(context: AiContext | undefined): string {
  switch (context?.kind) {
    case 'Learn':
      return 'Đang hỏi theo bài Learn đang mở';
    case 'Result':
      return 'Đang hỏi theo kết quả phiên của bạn';
    case 'Training':
      return 'Đang hỏi theo bài tập bạn chọn (không gồm ngưỡng chấm)';
    default:
      return 'Hỏi về bài học, kết quả của bạn';
  }
}

/**
 * Ready-made questions. A Training gets guidance criterion by criterion (the AI sees each criterion's name and description,
 * never the thresholds or pass mark); a Result gets a review of each criterion.
 */
export function aiSuggestions(context: AiContext | undefined): string[] {
  if (context?.kind === 'Result')
    return ['Nhận xét từng tiêu chí của lượt này giúp tôi', 'Lần sau tôi cần làm gì để đạt?'];
  if (context?.kind === 'Training')
    return ['Hướng dẫn tôi hoàn thành từng tiêu chí của bài này', 'Bài này cần chú ý những gì?'];
  return [];
}
