import { Injectable } from '@nestjs/common';
import { RetrievalService, RetrievalOptions } from '../rag/retrieval.service';
import { DocumentIngestionService, DocumentSource, IngestionOptions } from '../rag/document-ingestion.service';
import { PrismaService } from '../../common/prisma.service';

export interface SearchKnowledgeBaseInput {
  query: string;
  knowledgeBaseId?: string;
  topK?: number;
  similarityThreshold?: number;
}

export interface IngestDocumentInput {
  knowledgeBaseId: string;
  title: string;
  content: string;
  sourceType: 'pdf' | 'markdown' | 'text' | 'faq' | 'erp_docs' | 'web' | 'manual';
  sourceRef?: string;
  mimeType?: string;
  chunkSize?: number;
  chunkOverlap?: number;
}

export interface IngestFAQInput {
  knowledgeBaseId: string;
  entries: Array<{
    question: string;
    answer: string;
    category?: string;
    tags?: string[];
  }>;
}

@Injectable()
export class SearchKnowledgeBaseTool {
  constructor(
    private readonly retrievalService: RetrievalService,
    private readonly prisma: PrismaService,
  ) {}

  async execute(context: { tenantId: string; userId: string; role: string }, input: SearchKnowledgeBaseInput) {
    const { query, knowledgeBaseId, topK = 5, similarityThreshold = 0.7 } = input;

    // Get available knowledge bases for this tenant
    let kbIds: string[] = [];
    if (knowledgeBaseId) {
      // Verify KB belongs to tenant
      const kb = await this.retrievalService.getKnowledgeBase(context.tenantId, knowledgeBaseId);
      if (!kb) throw new Error('Knowledge base not found or access denied');
      kbIds = [knowledgeBaseId];
    } else {
      // Search all active KBs for tenant
      const kbs = await this.retrievalService.listKnowledgeBases(context.tenantId);
      kbIds = kbs.map(k => k.id);
      if (kbIds.length === 0) {
        return { results: [], message: 'No active knowledge bases found for this tenant' };
      }
    }


    const options: RetrievalOptions = { topK, similarityThreshold };

    let result;
    if (kbIds.length === 1) {
      result = await this.retrievalService.retrieve(context.tenantId, kbIds[0], query, options);
    } else {
      result = await this.retrievalService.retrieveMulti(context.tenantId, kbIds, query, options);
    }

    return {
      results: result.chunks.map(chunk => ({
        id: chunk.id,
        documentId: chunk.documentId,
        knowledgeBaseId: chunk.knowledgeBaseId,
        content: chunk.content,
        similarity: Math.round(chunk.similarity * 1000) / 1000,
        chunkIndex: chunk.chunkIndex,
        metadata: chunk.metadata,
        documentTitle: chunk.documentTitle,
        documentSourceType: chunk.documentSourceType,
        documentSourceRef: chunk.documentSourceRef,
      })),
      queryEmbedding: result.queryEmbedding,
      totalChunksScanned: result.totalChunksScanned,
      latencyMs: result.latencyMs,
    };
  }
}

@Injectable()
export class IngestDocumentTool {
  constructor(
    private readonly ingestionService: DocumentIngestionService,
    private readonly prisma: PrismaService,
  ) {}

  async execute(context: { tenantId: string; userId: string; role: string }, input: IngestDocumentInput) {
    const { knowledgeBaseId, title, content, sourceType, sourceRef, mimeType, chunkSize = 1000, chunkOverlap = 200 } = input;

    // Verify KB belongs to tenant
    const kb = await this.prisma.withTenant(context.tenantId, async (tx) => {
      return tx.knowledgeBase.findFirst({
        where: { id: knowledgeBaseId, tenantId: context.tenantId, isActive: true },
      });
    });
    if (!kb) throw new Error('Knowledge base not found or access denied');

    const options: IngestionOptions = {
      chunkSize,
      chunkOverlap,
      embeddingProvider: kb.embeddingProvider,
      embeddingModel: kb.embeddingModel,
    };

    const source: DocumentSource = {
      type: sourceType,
      reference: sourceRef || `manual-${Date.now()}`,
      title,
      content,
      mimeType,
      metadata: { ingestedBy: context.userId },
    };

    const result = await this.ingestionService.ingestDocument(context.tenantId, knowledgeBaseId, source, options);

    return {
      documentId: result.documentId,
      chunksCreated: result.chunksCreated,
      chunksEmbedded: result.chunksEmbedded,
      status: result.status,
      errorMessage: result.errorMessage,
    };
  }
}

@Injectable()
export class IngestFAQTool {
  constructor(
    private readonly ingestionService: DocumentIngestionService,
    private readonly prisma: PrismaService,
  ) {}

  async execute(context: { tenantId: string; userId: string; role: string }, input: IngestFAQInput) {
    const { knowledgeBaseId, entries } = input;

    // Verify KB belongs to tenant
    const kb = await this.prisma.withTenant(context.tenantId, async (tx) => {
      return tx.knowledgeBase.findFirst({
        where: { id: knowledgeBaseId, tenantId: context.tenantId, isActive: true },
      });
    });
    if (!kb) throw new Error('Knowledge base not found or access denied');

    const options: IngestionOptions = {
      embeddingProvider: kb.embeddingProvider,
      embeddingModel: kb.embeddingModel,
    };

    const results = await this.ingestionService.ingestFAQ(context.tenantId, knowledgeBaseId, entries, options);

    return {
      results,
      totalProcessed: results.length,
      successful: results.filter(r => r.status === 'completed').length,
      failed: results.filter(r => r.status === 'failed').length,
    };
  }
}

@Injectable()
export class ListKnowledgeBasesTool {
  constructor(private readonly retrievalService: RetrievalService) {}

  async execute(context: { tenantId: string }, _args?: any) {
    const kbs = await this.retrievalService.listKnowledgeBases(context.tenantId);

    return {
      knowledgeBases: kbs.map(kb => ({
        id: kb.id,
        name: kb.name,
        description: kb.description,
        embeddingProvider: kb.embeddingProvider,
        embeddingModel: kb.embeddingModel,
        embeddingDimensions: kb.embeddingDimensions,
        chunkSize: kb.chunkSize,
        chunkOverlap: kb.chunkOverlap,
        isActive: kb.isActive,
        createdAt: kb.createdAt,
        updatedAt: kb.updatedAt,
      })),
    };
  }
}

@Injectable()
export class DeleteDocumentTool {
  constructor(
    private readonly ingestionService: DocumentIngestionService,
  ) {}

  async execute(context: { tenantId: string }, input?: { documentId: string } | string | Record<string, any>) {
    const documentId = typeof input === 'string' ? input : (input as any)?.documentId;
    await this.ingestionService.deleteDocument(context.tenantId, documentId);
    return { success: true, message: 'Document deleted successfully' };
  }
}

@Injectable()
export class GetDocumentStatusTool {
  constructor(
    private readonly ingestionService: DocumentIngestionService,
  ) {}

  async execute(context: { tenantId: string }, input?: { documentId: string } | string | Record<string, any>) {
    const documentId = typeof input === 'string' ? input : (input as any)?.documentId;
    const document = await this.ingestionService.getDocumentStatus(context.tenantId, documentId);
    if (!document) throw new Error('Document not found');

    return {
      id: document.id,
      title: document.title,
      status: document.status,
      chunkCount: document.chunkCount,
      sourceType: document.sourceType,
      sourceRef: document.sourceRef,
      errorMessage: document.errorMessage,
      createdAt: document.createdAt,
      processedAt: document.processedAt,
    };
  }
}