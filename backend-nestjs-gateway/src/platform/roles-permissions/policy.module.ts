import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PolicyService } from './policy.service';

@Global()
@Module({ providers: [PrismaService, PolicyService], exports: [PolicyService] })
export class PolicyModule {}
