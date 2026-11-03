import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePaymentDto } from './create-payment.dto';

describe('CreatePaymentDto target contract', () => {
  const base = { member_id: 'MEM-1', amount: 1200, currency: 'INR', payment_method: 'razorpay' };

  it.each([
    ['membership target', { membership_id: 'MS-1' }, true],
    ['booking target', { booking_id: 'BK-1' }, true],
    ['both targets', { membership_id: 'MS-1', booking_id: 'BK-1' }, false],
    ['no target', {}, false],
  ])('accepts only one target (%s)', async (_label, target, valid) => {
    const dto = plainToInstance(CreatePaymentDto, { ...base, ...target });
    const errors = await validate(dto);
    expect(errors.length === 0).toBe(valid);
  });
});
