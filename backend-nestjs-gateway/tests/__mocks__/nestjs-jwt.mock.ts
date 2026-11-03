// Mock for @nestjs/jwt to avoid ESM issues in Jest
export class JwtService {
  sign = jest.fn().mockReturnValue('mock-token');
  verify = jest.fn().mockReturnValue({ sub: 'test-user', role: 'admin' });
  decode = jest.fn().mockReturnValue({ sub: 'test-user', role: 'admin' });
}