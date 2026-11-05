import { Injectable } from '@nestjs/common';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ERP_METHODS } from '@wsos/erp-methods';
import { PrismaService } from '../../common/prisma.service';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { randomUUID } from 'node:crypto';

export interface CreateMemberArgs {
  fullName: string;
  phone: string;
  email?: string;
  planId?: string;
  startDate?: string;
}

export interface MemberCreateResponse {
  id?: string;
  member_id?: string;
  name?: string;
  duplicate?: boolean;
}

interface StudioMemberCreateInput {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  phone: string;
}

@Injectable()
export class CreateMemberTool extends BaseTool {
  constructor(
    protected readonly erp: ErpnextService,
    private readonly prisma?: PrismaService,
  ) {
    super(erp);
  }

  /**
   * Strip leading "named", "name is", "called", "name:" from fullName (case-insensitive)
   * Does not modify the name otherwise
   */
  private cleanFullName(fullName: string): string {
    return fullName.replace(/^(?:named|name\s+is|called|name\s*:)\s+/i, '').trim();
  }

  async execute(context: ToolContext, args: CreateMemberArgs | Record<string, any>): Promise<ToolResult> {
    // 1. Defense-in-depth: Ensure write actions only execute via confirmed pending action
    if (!context.isConfirmedPendingAction) {
      return this.error(
        'Direct execution blocked: createMember requires explicit user confirmation via a pending action',
        'CONFIRMATION_REQUIRED',
      );
    }

    // 2. Validate mandatory required fields
    const validationError = this.validateRequired(args as unknown as Record<string, unknown>, ['fullName', 'phone']);
    if (validationError) return this.error(validationError, 'INVALID_ARGUMENTS');

    const fullName = this.cleanFullName(typeof args.fullName === 'string' ? args.fullName.trim() : '');
    if (fullName.length < 1 || fullName.length > 120) {
      return this.error('fullName must be between 1 and 120 characters', 'INVALID_ARGUMENTS');
    }

    const phone = typeof args.phone === 'string' ? args.phone.trim().replace(/[\s()-]/g, '') : '';
    if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) {
      return this.error(
        'Phone must use E.164 format (e.g., +919876543210 or +12025550123 with country code and leading +)',
        'INVALID_ARGUMENTS',
      );
    }

    // Optional email validation
    let email: string | undefined = undefined;
    if (args.email !== undefined && args.email !== null && args.email !== '') {
      email = String(args.email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return this.error('Invalid email format', 'INVALID_ARGUMENTS');
      }
    }

    // Optional startDate validation
    let startDate: string | undefined = undefined;
    if (args.startDate !== undefined && args.startDate !== null && args.startDate !== '') {
      startDate = String(args.startDate).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return this.error('startDate must be in YYYY-MM-DD format', 'INVALID_ARGUMENTS');
      }
    }

    // 3. Call authoritative member creation service in ERP
    // Use ERP_METHODS.MEMBER_CREATE which is 'wellness_studio.api.member.create_member'
    // Include tenantCode (tenant code like 'pilot-studio') as required by ERP
    let result = await this.callErp<MemberCreateResponse>(context, ERP_METHODS.MEMBER_CREATE, {
      tenant: context.tenantCode,
      full_name: fullName,
      phone,
      email,
      plan_id: args.planId,
      start_date: startDate,
      status: 'active',
    });

    // Fallback to PostgreSQL if ERP unavailable and Prisma available
    if (!result.success && result.error?.includes('unavailable') && this.prisma) {
      const memberId = randomUUID();
      try {
        await this.prisma.withTenant(context.tenantId, async (tx) => {
          await tx.studioMember.create({
            data: {
              id: memberId,
              tenantId: context.tenantId,
              fullName,
              email: email || '',
              phone,
              plan: args.planId || 'Standard',
              status: 'Active',
              joined: startDate ? new Date(startDate) : new Date(),
              coach: 'Unassigned',
            },
          });
        });
        result = { success: true, data: { id: memberId, duplicate: false } as MemberCreateResponse };
      } catch (pgError) {
        // Keep original ERP error
      }
    }

    if (!result.success) return result;

    const memberId = result.data?.id || result.data?.member_id || result.data?.name;
    const isDuplicate = Boolean(result.data?.duplicate);

    if (isDuplicate) {
      return this.success({
        memberId,
        fullName,
        phone,
        email,
        isDuplicate: true,
        summary: `Member ${fullName} (${phone}) already exists in tenant with ID ${memberId}`,
      });
    }

    return this.success({
      memberId,
      fullName,
      phone,
      email,
      planId: args.planId,
      startDate,
      isDuplicate: false,
      summary: `Member ${fullName} created successfully with ID ${memberId}`,
    });
  }
}
