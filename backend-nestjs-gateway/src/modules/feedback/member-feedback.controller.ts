import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { CreateMemberFeedbackDto } from './dto/create-feedback.dto';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { AuthenticatedAccessGuard } from '../../common/authenticated-access.guard';
import type { RequestWithContext } from '../../common/request-context.types';

@Controller('feedback/member')
@UseGuards(TenantContextGuard, AuthenticatedAccessGuard)
export class MemberFeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async submitFeedback(
    @Req() req: RequestWithContext,
    @Body() dto: CreateMemberFeedbackDto,
  ) {
    const context = {
      tenantId: req.tenantId as string,
      userId: req.auth!.userId,
      roles: req.auth?.roles ?? ['member'],
      correlationId: (req.correlationId || req.headers?.['x-correlation-id']) as string | undefined,
    };
    return this.feedbackService.createMemberFeedback(context, dto);
  }

  @Get('my')
  async getMyFeedback(@Req() req: RequestWithContext) {
    const context = {
      tenantId: req.tenantId as string,
      userId: req.auth!.userId,
      roles: req.auth?.roles ?? ['member'],
    };
    return this.feedbackService.findMemberFeedback(context);
  }
}
