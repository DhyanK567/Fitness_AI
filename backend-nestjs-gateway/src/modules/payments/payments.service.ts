import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ErpBaseService, ToolContext, ToolResult } from '../../common/erp-base.service';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { PrismaService } from '../../common/prisma.service';
import { CreatePaymentDto, UpdatePaymentDto, PaymentResponseDto } from './dto';
import { ERP_METHODS } from '@wsos/erp-methods';

@Injectable()
export class PaymentsService extends ErpBaseService {
  constructor(erp: ErpnextService, private readonly prisma?: PrismaService) {
    super(erp);
  }
  async create(context: ToolContext, dto: CreatePaymentDto): Promise<ToolResult<PaymentResponseDto>> {
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      const ref = String(dto.ref || `MAN-${Date.now().toString(36).toUpperCase()}`);
      const method = String(dto.payment_method || (dto as any).method || 'Cash');
      const type = String(dto.type || (dto.membership_id ? 'Membership' : dto.booking_id ? 'Class pass' : 'Membership'));
      const status = String(dto.status || 'Paid');
      const amount = Math.round(Number(dto.amount) || 0);

      const created: any = await this.prisma.withTenant(context.tenantId, (tx: any) => {
        if (!tx?.studioPayment?.create) return null;
        return tx.studioPayment.create({
          data: {
            tenantId: context.tenantId,
            ref,
            date: new Date(),
            memberId: dto.member_id,
            type,
            method,
            status,
            amount,
            notes: (dto.notes as string) || null,
          },
        });
      });
      if (created) {
        try {
          await this.callErp<PaymentResponseDto>(context, ERP_METHODS.PAYMENT_CREATE, { ...dto } as Record<string, unknown>);
        } catch {}
        return this.success({
          id: created.id,
          member_id: dto.member_id,
          membership_id: dto.membership_id ?? null,
          booking_id: dto.booking_id ?? null,
          amount: created.amount,
          currency: 'INR',
          payment_method: method,
          status: status.toLowerCase(),
          ref: created.ref,
          notes: created.notes,
        } as any);
      }
    }
    const hasMembership = !!dto.membership_id;
    const hasBooking = !!dto.booking_id;
    if (hasMembership === hasBooking) {
      return this.error('Exactly one of membership_id or booking_id required');
    }
    const result = await this.callErp<PaymentResponseDto>(context, ERP_METHODS.PAYMENT_CREATE, { ...dto } as Record<string, unknown>);
    if (!result.success) return result;
    return this.success(result.data as PaymentResponseDto);
  }

  async findAll(context: ToolContext, memberId?: string): Promise<ToolResult<PaymentResponseDto[]>> {
    // For member role, filter by own userId
    const effectiveMemberId = context.role === 'member' ? context.userId : memberId;
    if (!['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase()) && typeof this.prisma?.withTenant === 'function') {
      // Use Prisma store
      const payments = await this.prisma.withTenant(context.tenantId, async (tx: any) => {
        return tx.studioPayment.findMany({
          where: {
            tenantId: context.tenantId,
            ...(effectiveMemberId ? { memberId: effectiveMemberId } : {}),
          },
          orderBy: { createdAt: 'desc' },
        });
      });
      const data = payments.map((p: any) => ({
        id: p.id,
        ref: p.ref,
        date: p.date,
        memberId: p.memberId,
        type: p.type,
        method: p.method,
        status: p.status as any,
        amount: p.amount,
        refundedAmount: p.refundedAmount,
        notes: p.notes ?? '',
      }));
      return this.success(data);
    }
    const result = await this.callErp<{ payments: PaymentResponseDto[] }>(context, ERP_METHODS.PAYMENT_LIST, { member_id: effectiveMemberId });
    if (!result.success) return result as unknown as ToolResult<PaymentResponseDto[]>;
    const data = result.data?.payments || [];
    return this.success(data);
  }

  async findOne(context: ToolContext, id: string): Promise<ToolResult<PaymentResponseDto>> {
    const result = await this.callErp<PaymentResponseDto>(context, ERP_METHODS.PAYMENT_GET, { id });
    if (!result.success) {
      if (result.error?.includes('404')) throw new NotFoundException(`Payment ${id} not found`);
      return result;
    }
    // For member role, check ownership
    if (context.role === 'member' && result.data?.member_id !== context.userId) {
      return { success: false, error: '404 Not Found' };
    }
    return result;
  }

  async update(context: ToolContext, id: string, dto: UpdatePaymentDto): Promise<ToolResult<PaymentResponseDto>> {
    // For member role, only allow update of own payment
    if (context.role === 'member') {
      const existing = await this.findOne(context, id);
      if (!existing.success || existing.data?.member_id !== context.userId) {
        throw new ForbiddenException('Cannot update another member\'s payment');
      }
    }
    const result = await this.callErp<PaymentResponseDto>(context, ERP_METHODS.PAYMENT_UPDATE, { id, ...dto });
    if (!result.success) return result;
    return this.success(result.data as PaymentResponseDto);
  }

  async refund(context: ToolContext, id: string): Promise<ToolResult<PaymentResponseDto>> {
    // For member role, only allow refund of own payment
    if (context.role === 'member') {
      const existing = await this.findOne(context, id);
      if (!existing.success || existing.data?.member_id !== context.userId) {
        throw new ForbiddenException('Cannot refund another member\'s payment');
      }
    }
    const result = await this.callErp<PaymentResponseDto>(context, ERP_METHODS.PAYMENT_REFUND, { id });
    if (!result.success) return result;
    return this.success(result.data as PaymentResponseDto);
  }

  async processWebhook(context: ToolContext, rawBody: string, signature: string): Promise<ToolResult<unknown>> {
    const result = await this.callErp(context, ERP_METHODS.PAYMENT_WEBHOOK, { rawBody, signature });
    return result;
  }
}
