export type ChatResponse = {
  answer: string;
  sources: { document_name: string; chunk_index: number }[];
};
export async function askQuestion(question: string, signal: AbortSignal): Promise<ChatResponse> {
  const base = process.env.EXPO_PUBLIC_RAG_API_URL?.replace(/\/$/, '');
  if (!base)
    throw new Error('Trợ lý chưa được kết nối. Vui lòng cấu hình địa chỉ dịch vụ RAG để sử dụng.');
  const response = await fetch(`${base}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
    signal,
  });
  if (!response.ok)
    throw new Error(`Dịch vụ chưa trả lời được (HTTP ${response.status}). Vui lòng thử lại.`);
  const data: unknown = await response.json();
  if (
    !data ||
    typeof data !== 'object' ||
    !('answer' in data) ||
    typeof data.answer !== 'string' ||
    !('sources' in data) ||
    !Array.isArray(data.sources) ||
    !data.sources.every(
      (s: unknown) =>
        s &&
        typeof s === 'object' &&
        'document_name' in s &&
        typeof s.document_name === 'string' &&
        'chunk_index' in s &&
        typeof s.chunk_index === 'number',
    )
  )
    throw new Error('Dữ liệu trả về chưa đúng định dạng. Vui lòng thử lại.');
  return data as ChatResponse;
}
