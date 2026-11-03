import { Injectable } from '@nestjs/common';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ERP_METHODS } from '@wsos/erp-methods';

interface LeadCreateResponse {
  id: string;
}

@Injectable()
export class CaptureLeadTool extends BaseTool {
  async execute(context: ToolContext, args: { 
    name: string; 
    phone: string; 
    email?: string; 
    interest?: string; 
    consent: boolean 
  }): Promise<ToolResult> {
    if (!args.consent) {
      return this.error('Consent is required to create a lead');
    }

    const validationError = this.validateRequired(args, ['name', 'phone']);
    if (validationError) return this.error(validationError);

    const result = await this.callErp<LeadCreateResponse>(context, ERP_METHODS.LEAD_CREATE, {
      full_name: args.name,
      phone: args.phone,
      email: args.email,
      source: 'AI_ENQUIRY',
      status: 'new',
      notes: args.interest ? `Interest: ${args.interest}` : undefined,
    });

    if (!result.success) return result;
    
    return this.success({
      leadId: result.data?.id,
      summary: `Lead created for ${args.name} (${args.phone})`,
    });
  }
}