import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
import { AuthRegistrationController } from './auth-registration.controller';
import { AuthService } from './auth.service';
import { PlatformRateLimitGuard } from './platform-rate-limit.guard';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { RegisterStudioDto } from './dto/register-studio.dto';
import { ErrorCode } from '@fitness-ai/error-codes';

describe('AuthRegistrationController', () => {
  let controller: AuthRegistrationController;
  let authService: jest.Mocked<AuthService>;
  const validationPipe = new ValidationPipe({ transform: true, whitelist: true });

  const executeWithValidation = async (input: any) => {
    const dto = await validationPipe.transform(input, { type: 'body', metatype: RegisterStudioDto });
    return controller.registerStudio(dto);
  };

  const mockAuthService = {
    registerStudio: jest.fn(),
    checkStudioAvailability: jest.fn(),
  };

  const mockRateLimitGuard = {
    canActivate: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthRegistrationController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
      ],
    })
      .overrideGuard(PlatformRateLimitGuard)
      .useValue(mockRateLimitGuard)
      .overrideGuard(LoginRateLimitGuard)
      .useValue(mockRateLimitGuard)
      .compile();

    controller = module.get<AuthRegistrationController>(AuthRegistrationController);
    authService = module.get(AuthService);
    jest.clearAllMocks();
  });

  describe('POST /auth/register/studio', () => {
    const validInput = {
      studio_name: 'Test Studio',
      owner_name: 'John Owner',
      owner_email: 'owner@teststudio.fitness',
      owner_phone: '+919876543210',
      password: 'SecurePassword123!',
    };

    it('returns 201 with an immediate, short-lived MFA enrollment handshake', async () => {
      const mockResult = {
        tenant_code: 'test-studio',
        owner_email: 'owner@teststudio.fitness',
        requires_email_verification: false,
        mfa_enrollment_required: true,
        enrollment_token: 'header.payload.signature',
        subscription_plan: 'Basic' as const,
      };
      authService.registerStudio.mockResolvedValue(mockResult as any);

      const result = await executeWithValidation(validInput);

      expect(result).toEqual(mockResult);
      expect(authService.registerStudio).toHaveBeenCalledWith(validInput);
    });

    it('throws ConflictException when email already registered', async () => {
      authService.registerStudio.mockRejectedValue(
        new ConflictException('An account already uses this email.'),
      );

      await expect(executeWithValidation(validInput)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when tenant code already taken', async () => {
      authService.registerStudio.mockRejectedValue(
        new BadRequestException('Tenant code test-studio is already taken'),
      );

      await expect(executeWithValidation(validInput)).rejects.toThrow(BadRequestException);
    });

    it('throws ServiceUnavailableException when rate limited', async () => {
      authService.registerStudio.mockRejectedValue(
        new ServiceUnavailableException('Request throttling is unavailable'),
      );

      await expect(executeWithValidation(validInput)).rejects.toThrow(ServiceUnavailableException);
    });

    it('validates studio_name min length', async () => {
      const input = { ...validInput, studio_name: 'A' };
      await expect(executeWithValidation(input)).rejects.toThrow();
    });

    it('validates studio_name max length', async () => {
      const input = { ...validInput, studio_name: 'a'.repeat(121) };
      await expect(executeWithValidation(input)).rejects.toThrow();
    });

    it('validates owner_name min length', async () => {
      const input = { ...validInput, owner_name: 'A' };
      await expect(executeWithValidation(input)).rejects.toThrow();
    });

    it('validates owner_name max length', async () => {
      const input = { ...validInput, owner_name: 'a'.repeat(161) };
      await expect(executeWithValidation(input)).rejects.toThrow();
    });

    it('validates owner_email format', async () => {
      const input = { ...validInput, owner_email: 'invalid-email' };
      await expect(executeWithValidation(input)).rejects.toThrow();
    });

    it('validates owner_phone format when provided', async () => {
      const input = { ...validInput, owner_phone: '123' };
      await expect(executeWithValidation(input)).rejects.toThrow();
    });

    it('validates password min length (10 chars)', async () => {
      const input = { ...validInput, password: 'Short123' };
      await expect(executeWithValidation(input)).rejects.toThrow();
    });

    it('validates password max length', async () => {
      const input = { ...validInput, password: 'a'.repeat(129) };
      await expect(executeWithValidation(input)).rejects.toThrow();
    });

    it('owner_phone is optional', async () => {
      const { owner_phone, ...input } = validInput;
      const mockResult = {
        tenant_code: 'test-studio',
        owner_email: input.owner_email,
        requires_email_verification: false,
        mfa_enrollment_required: true,
        enrollment_token: 'header.payload.signature',
        subscription_plan: 'Basic' as const,
      };
      authService.registerStudio.mockResolvedValue(mockResult as any);

      const result = await executeWithValidation(input);

      expect(result).toBeDefined();
      expect(authService.registerStudio).toHaveBeenCalledWith(input);
    });
  });
});
