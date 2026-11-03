import { Controller, Get, Query, UseGuards, Request, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { RecommendationsService } from './recommendations.service';
import { RecommendationQueryDto } from './dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('Recommendations')
@ApiBearerAuth()
@Controller('recommendations')
@UseGuards(AuthGuard, PermissionGuard)
export class RecommendationsController {
  constructor(private readonly service: RecommendationsService) {}

  @Get()
  @RequirePermission('recommendations:read')
  @ApiOperation({ summary: 'Get personalized recommendations' })
  async getRecommendations(
    @Request() req: any,
    @Query() query: RecommendationQueryDto,
  ) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required');
    }

    const callerRole = req.user?.role;
    const callerId = req.user?.id;

    // Reject attempts to request another member's recommendations
    if (callerRole === 'member' && query.memberId && query.memberId !== callerId) {
      throw new ForbiddenException("Members can only request their own recommendations");
    }

    const targetMemberId = (callerRole === 'member' || !query.memberId) ? callerId : query.memberId;

    const context = {
      tenantId,
      userId: targetMemberId,
      role: callerRole,
      correlationId: req.headers?.['x-correlation-id'] || randomUUID(),
    };

    const result = await this.service.getRecommendations(context, {
      ...query,
      memberId: targetMemberId,
    });

    if (!result.success) {
      const errMsg = result.error || 'Failed to retrieve recommendations';
      if (errMsg.toLowerCase().includes('not found')) {
        throw new NotFoundException(errMsg);
      }
      if (errMsg.toLowerCase().includes('not active') || errMsg.toLowerCase().includes('inactive')) {
        throw new ForbiddenException(errMsg);
      }
      throw new BadRequestException(errMsg);
    }

    return result;
  }
}
