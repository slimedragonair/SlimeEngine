export type InlinePng = { mime_type: 'image/png'; base64: string };

export function validateInlinePng(value: unknown): InlinePng {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected one inline PNG.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== 2 || input.mime_type !== 'image/png' ||
    typeof input.base64 !== 'string' || input.base64.length > 349528 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64)) throw new Error('Unsupported inline PNG encoding.');
  const bytes = Buffer.from(input.base64, 'base64');
  if (!bytes.length || bytes.length > 262144 || bytes.toString('base64') !== input.base64 ||
    bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    bytes.subarray(12, 16).toString('ascii') !== 'IHDR' || bytes.length < 24) throw new Error('Invalid or oversized PNG content.');
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 1 || height < 1 || width > 4096 || height > 4096) throw new Error('PNG dimensions exceed the fixture limit.');
  return { mime_type: 'image/png', base64: input.base64 };
}
