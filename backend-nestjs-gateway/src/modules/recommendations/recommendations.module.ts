import { Module } from '@nestjs/common';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { ErpnextModule } from '../../erpnext/erpnext.module';
import { PrismaService } from '../../common/prisma.service';

@Module({
  imports: [ErpnextModule],
  controllers: [RecommendationsController],
  providers: [RecommendationsService, PrismaService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
