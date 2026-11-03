import { Injectable } from '@nestjs/common';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ERP_METHODS } from '@wsos/erp-methods';

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

@Injectable()
export class CreateMemberTool extends BaseTool {
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

    const fullName = typeof args.fullName === 'string' ? args.fullName.trim() : '';
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
    // Primary method is ERP_METHODS.MEMBER_CREATE ('wellness_studio.api.member.create')
    // With fallback to 'wellness_studio.api.member.create_member' if the alias is used
    let result = await this.callErp<MemberCreateResponse>(context, ERP_METHODS.MEMBER_CREATE, {
      full_name: fullName,
      phone,
      email,
      plan_id: args.planId,
      start_date: startDate,
      status: 'active',
    });

    if (!result.success && result.error?.includes('unavailable')) {
      // Try alternate ERP method endpoint name
      result = await this.callErp<MemberCreateResponse>(context, 'wellness_studio.api.member.create_member', {
        tenant: context.tenantId,
        full_name: fullName,
        phone,
        email,
        plan_id: args.planId,
        start_date: startDate,
        status: 'active',
      });
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
