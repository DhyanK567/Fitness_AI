import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: { getHealth: jest.fn<() => Promise<{ status: string }>>().mockResolvedValue({ status: 'ok' }) },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('returns the ERP health result', async () => {
      await expect(appController.getHealth()).resolves.toEqual({ status: 'ok' });
    });
  });
});
