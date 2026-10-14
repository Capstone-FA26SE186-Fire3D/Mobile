export function base64Url(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i],
      b = bytes[i + 1],
      c = bytes[i + 2];
    result += alphabet[a >> 2] + alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (i + 1 < bytes.length) result += alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (i + 2 < bytes.length) result += alphabet[c & 63];
  }
  return result;
}
