import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Prisma } from '@prisma/client';

export interface CreateConversationInput {
  tenantId: string;
  userId: string;
  title?: string;
}

export interface AddMessageInput {
  conversationId: string;
  tenantId: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolCalls?: Record<string, unknown>[];
  toolResults?: Record<string, unknown>[];
  tokenCount?: number;
}

export interface ConversationQueryOptions {
  page?: number;
  limit?: number;
  status?: string;
}

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateConversationInput) {
    return this.prisma.withTenant(input.tenantId, async (tx) => {
      return tx.conversation.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          title: input.title,
          status: 'active',
        },
      });
    });
  }

  async findById(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id, tenantId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 100,
          },
          pendingActions: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }

      return conversation;
    });
  }

  async findByUser(tenantId: string, userId: string, options: ConversationQueryOptions = {}) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const { page = 1, limit = 20, status } = options;
      const skip = (page - 1) * limit;

      const where: Prisma.ConversationWhereInput = {
        tenantId,
        userId,
        ...(status ? { status } : {}),
      };

      const [conversations, total] = await Promise.all([
        tx.conversation.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          skip,
          take: limit,
          include: {
            _count: { select: { messages: true } },
          },
        }),
        tx.conversation.count({ where }),
      ]);

      return {
        conversations,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    });
  }

  async addMessage(input: AddMessageInput) {
    return this.prisma.withTenant(input.tenantId, async (tx) => {
      // Verify conversation belongs to tenant
      const conversation = await tx.conversation.findFirst({
        where: { id: input.conversationId, tenantId: input.tenantId },
      });

      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }

      return tx.message.create({
        data: {
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
          toolCalls: input.toolCalls as Prisma.InputJsonValue | undefined,
          toolResults: input.toolResults as Prisma.InputJsonValue | undefined,
          tokenCount: input.tokenCount,
        },
      });
    });
  }

  async archive(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id, tenantId },
      });

      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }

      return tx.conversation.update({
        where: { id },
        data: {
          status: 'archived',
          archivedAt: new Date(),
        },
      });
    });
  }

  async delete(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id, tenantId },
      });

      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }

      // Soft delete
      return tx.conversation.update({
        where: { id },
        data: {
          status: 'deleted',
          archivedAt: new Date(),
        },
      });
    });
  }

  async updateTitle(tenantId: string, id: string, title: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id, tenantId },
      });

      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }

      return tx.conversation.update({
        where: { id },
        data: { title },
      });
    });
  }

  async purge(tenantId: string, id: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id, tenantId },
      });

      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }

      await tx.message.deleteMany({
        where: { conversationId: id, tenantId },
      });

      await tx.pendingAction.deleteMany({
        where: { conversationId: id, tenantId },
      });

      return tx.conversation.delete({
        where: { id },
      });
    });
  }
}