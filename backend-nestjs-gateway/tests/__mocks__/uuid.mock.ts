// Mock for uuid to avoid ESM issues in Jest
export function v4(): string {
  return 'test-uuid-' + Math.random().toString(36).substring(2, 15);
}

export function validate(uuid: string): boolean {
  return typeof uuid === 'string' && uuid.length > 0;
}

export function parse(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

export function stringify(buffer: Buffer): string {
  return buffer.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}