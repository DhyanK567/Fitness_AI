import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { RazorpayWebhookService } from './razorpay-webhook.service';

describe('RazorpayWebhookController', () => {
  let controller: RazorpayWebhookController;
  let mockService: any;

  beforeEach(() => {
    mockService = {
      processWebhook: jest.fn().mockResolvedValue({
        success: true,
        duplicate: false,
        event_id: 'evt_123',
      }),
    };

    controller = new RazorpayWebhookController(mockService as RazorpayWebhookService);
  });

  it('delegates to RazorpayWebhookService with authentic rawBody and signature', async () => {
    const rawBuffer = Buffer.from('{"id":"evt_123","event":"subscription.charged"}', 'utf8');
    const mockRequest = {
      rawBody: rawBuffer,
      correlationId: '123e4567-e89b-42d3-a456-426614174000',
      ip: '198.51.100.1',
    } as any;
    const signature = 'valid_test_signature_hex';

    const result = await controller.handleWebhook(mockRequest, signature);

    expect(result).toEqual({
      success: true,
      duplicate: false,
      event_id: 'evt_123',
    });
    expect(mockService.processWebhook).toHaveBeenCalledWith({
      signature: 'valid_test_signature_hex',
      rawBody: rawBuffer,
      correlationId: '123e4567-e89b-42d3-a456-426614174000',
      ip: '198.51.100.1',
    });
  });

  it('bubbles service exceptions up to NestJS exception filters', async () => {
    mockService.processWebhook.mockRejectedValueOnce(new Error('Invalid signature'));

    const mockRequest = { rawBody: Buffer.from('test') } as any;

    await expect(controller.handleWebhook(mockRequest, 'bad_sig')).rejects.toThrow('Invalid signature');
  });
});
