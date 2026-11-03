import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { EmbeddingService, RAG_EMBEDDING_DIMENSIONS } from './embedding.service';

export interface DocumentSource {
  type: 'pdf' | 'markdown' | 'text' | 'faq' | 'erp_docs' | 'web' | 'manual';
  reference: string; // file path, URL, ERP doc ID, etc.
  title: string;
  content: string;
  mimeType?: string;
  fileSize?: number;
  metadata?: Record<string, any>;
}

export interface IngestionOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  embeddingProvider?: string;
  embeddingModel?: string;
  metadata?: Record<string, any>;
}

export interface IngestionResult {
  documentId: string;
  chunksCreated: number;
  chunksEmbedded: number;
  status: 'completed' | 'failed';
  errorMessage?: string;
}

@Injectable()
export class DocumentIngestionService {
  private readonly logger = new Logger(DocumentIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Ingest a single document into a knowledge base
   */
  async ingestDocument(
    tenantId: string,
    knowledgeBaseId: string,
    source: DocumentSource,
    options: IngestionOptions = {},
  ): Promise<IngestionResult> {
    const startTime = Date.now();
    const {
      chunkSize = 1000,
      chunkOverlap = 200,
      metadata = {},
    } = options;

    // Create document record
    const contentHash = this.hashContent(source.content);

    // Check for KB existence and duplicate within tenant context
    const { existing, kb } = await this.prisma.withTenant(tenantId, async (tx) => {
      const targetKb = await tx.knowledgeBase.findFirst({
        where: { id: knowledgeBaseId, tenantId, isActive: true },
        select: {
          id: true,
          embeddingProvider: true,
          embeddingModel: true,
          embeddingDimensions: true,
        },
      });
      if (!targetKb) {
        throw new Error(`Knowledge base not found or access denied for tenant.`);
      }
      const dup = await tx.knowledgeBaseDocument.findFirst({
        where: { tenantId, knowledgeBaseId, contentHash },
      });
      return { existing: dup, kb: targetKb };
    });

    if (existing) {
      this.logger.log(`Document already exists (duplicate content): ${existing.id}`);
      return {
        documentId: existing.id,
        chunksCreated: 0,
        chunksEmbedded: 0,
        status: 'completed',
      };
    }

    const expectedDimensions = kb.embeddingDimensions ?? RAG_EMBEDDING_DIMENSIONS;
    if (expectedDimensions !== RAG_EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Knowledge base "${knowledgeBaseId}" has embedding dimensions ${expectedDimensions}, which is incompatible with the 1536-dimensional vector schema.`
      );
    }

    // Ensure any explicit override cannot mismatch the KB's configured provider/model
    if (options.embeddingProvider && options.embeddingProvider !== kb.embeddingProvider) {
      throw new Error(
        `Embedding provider override "${options.embeddingProvider}" does not match knowledge base configured provider "${kb.embeddingProvider}".`
      );
    }
    if (options.embeddingModel && options.embeddingModel !== kb.embeddingModel) {
      throw new Error(
        `Embedding model override "${options.embeddingModel}" does not match knowledge base configured model "${kb.embeddingModel}".`
      );
    }

    const targetProvider = options.embeddingProvider || kb.embeddingProvider || 'openai';
    const targetModel = options.embeddingModel || kb.embeddingModel || 'text-embedding-3-small';

    const document = await this.prisma.withTenant(tenantId, async (tx) => {
      return tx.knowledgeBaseDocument.create({
        data: {
          tenantId,
          knowledgeBaseId,
          sourceType: source.type,
          sourceRef: source.reference,
          title: source.title,
          content: source.content,
          contentHash,
          mimeType: source.mimeType,
          fileSize: source.fileSize,
          status: 'processing',
          metadata: { ...metadata, ...source.metadata },
        },
      });
    });

    try {
      // Chunk the document
      const chunks = this.chunkText(source.content, chunkSize, chunkOverlap);

      if (chunks.length === 0) {
        await this.prisma.withTenant(tenantId, async (tx) => {
          await tx.knowledgeBaseDocument.update({
            where: { id: document.id },
            data: { status: 'completed', chunkCount: 0, processedAt: new Date() },
          });
        });
        return { documentId: document.id, chunksCreated: 0, chunksEmbedded: 0, status: 'completed' };
      }

      // Generate embeddings for all chunks using target KB's configured provider & model
      const chunkContents = chunks.map(c => c.content);
      const embeddings = await this.embeddingService.embed(chunkContents, targetProvider, {
        model: targetModel,
        inputType: 'document',
        dimensions: expectedDimensions,
      });

      // Create chunk records with embeddings and complete document in a single tenant-scoped transaction
      await this.prisma.withTenant(tenantId, async (tx) => {
        await this.persistChunksWithEmbeddings(
          tx,
          tenantId,
          knowledgeBaseId,
          document.id,
          chunks,
          embeddings,
          expectedDimensions,
          metadata,
        );

        await tx.knowledgeBaseDocument.update({
          where: { id: document.id },
          data: {
            status: 'completed',
            chunkCount: chunks.length,
            processedAt: new Date(),
          },
        });
      });

      this.logger.log(`Ingested document ${document.id}: ${chunks.length} chunks in ${Date.now() - startTime}ms`);

      return {
        documentId: document.id,
        chunksCreated: chunks.length,
        chunksEmbedded: chunks.length,
        status: 'completed',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to ingest document ${document.id}: ${errorMessage}`);

      try {
        await this.prisma.withTenant(tenantId, async (tx) => {
          await tx.knowledgeBaseDocument.update({
            where: { id: document.id },
            data: {
              status: 'failed',
              errorMessage,
            },
          });
        });
      } catch (updateErr) {
        this.logger.error(`Failed to update document status to failed: ${updateErr}`);
      }

      return {
        documentId: document.id,
        chunksCreated: 0,
        chunksEmbedded: 0,
        status: 'failed',
        errorMessage,
      };
    }
  }

  /**
   * Validate and persist chunks with embeddings using parameterized raw SQL into pgvector vector column
   */
  private async persistChunksWithEmbeddings(
    tx: Prisma.TransactionClient,
    tenantId: string,
    knowledgeBaseId: string,
    documentId: string,
    chunks: Array<{ content: string; metadata: Record<string, any> }>,
    embeddings: number[][],
    expectedDimensions: number,
    documentMetadata: Record<string, any>,
  ): Promise<void> {
    if (chunks.length !== embeddings.length) {
      throw new Error(`Mismatch between chunk count (${chunks.length}) and embedding count (${embeddings.length}).`);
    }

    // Validate all embeddings before any persistence
    for (let i = 0; i < embeddings.length; i++) {
      const emb = embeddings[i];
      if (!Array.isArray(emb)) {
        throw new Error(`Invalid embedding for chunk ${i}: expected array of numbers.`);
      }
      if (emb.length !== expectedDimensions) {
        throw new Error(
          `Embedding dimension mismatch for chunk ${i}: expected ${expectedDimensions}, got ${emb.length}.`
        );
      }
      for (let j = 0; j < emb.length; j++) {
        if (typeof emb[j] !== 'number' || !Number.isFinite(emb[j])) {
          throw new Error(`Invalid embedding vector at chunk ${i}, dimension ${j}: value must be a finite number.`);
        }
      }
    }

    // Batch insert chunks with raw SQL to properly populate pgvector Unsupported("vector(1536)") column
    const BATCH_SIZE = 50;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batchChunks = chunks.slice(i, i + BATCH_SIZE);
      const valueRows: string[] = [];
      const params: any[] = [];

      batchChunks.forEach((chunk, indexInBatch) => {
        const globalIndex = i + indexInBatch;
        const emb = embeddings[globalIndex];
        const offset = indexInBatch * 8;

        valueRows.push(
          `($${offset + 1}::uuid, $${offset + 2}::uuid, $${offset + 3}::uuid, $${offset + 4}::integer, $${offset + 5}, $${offset + 6}::vector, $${offset + 7}::integer, $${offset + 8}::jsonb)`
        );

        params.push(
          tenantId,
          knowledgeBaseId,
          documentId,
          globalIndex,
          chunk.content,
          `[${emb.join(',')}]`,
          this.estimateTokens(chunk.content),
          JSON.stringify({ ...chunk.metadata, ...documentMetadata }),
        );
      });

      const sql = `
        INSERT INTO ai.knowledge_chunks (
          tenant_id,
          knowledge_base_id,
          document_id,
          chunk_index,
          content,
          embedding,
          token_count,
          metadata
        ) VALUES ${valueRows.join(', ')}
      `;

      await tx.$executeRawUnsafe(sql, ...params);
    }
  }


  /**
   * Ingest multiple documents in batch
   */
  async ingestDocuments(
    tenantId: string,
    knowledgeBaseId: string,
    sources: DocumentSource[],
    options: IngestionOptions = {},
  ): Promise<IngestionResult[]> {
    const results: IngestionResult[] = [];
    
    for (const source of sources) {
      const result = await this.ingestDocument(tenantId, knowledgeBaseId, source, options);
      results.push(result);
    }

    return results;
  }

  /**
   * Ingest FAQ entries (specialized for Q&A pairs)
   */
  async ingestFAQ(
    tenantId: string,
    knowledgeBaseId: string,
    faqEntries: Array<{
      question: string;
      answer: string;
      category?: string;
      tags?: string[];
    }>,
    options: IngestionOptions = {},
  ): Promise<IngestionResult[]> {
    const sources: DocumentSource[] = faqEntries.map((entry, index) => ({
      type: 'faq',
      reference: `faq-${Date.now()}-${index}`,
      title: `FAQ: ${entry.question}`,
      content: `Q: ${entry.question}\n\nA: ${entry.answer}`,
      metadata: {
        category: entry.category,
        tags: entry.tags,
        question: entry.question,
        answer: entry.answer,
      },
    }));

    return this.ingestDocuments(tenantId, knowledgeBaseId, sources, options);
  }

  /**
   * Ingest from ERP documents (members, classes, etc.)
   */
  async ingestFromERP(
    tenantId: string,
    knowledgeBaseId: string,
    documents: Array<{
      docType: string;
      docId: string;
      title: string;
      content: string;
      metadata?: Record<string, any>;
    }>,
    options: IngestionOptions = {},
  ): Promise<IngestionResult[]> {
    const sources: DocumentSource[] = documents.map(doc => ({
      type: 'erp_docs',
      reference: `${doc.docType}-${doc.docId}`,
      title: doc.title,
      content: doc.content,
      metadata: {
        docType: doc.docType,
        docId: doc.docId,
        ...doc.metadata,
      },
    }));

    return this.ingestDocuments(tenantId, knowledgeBaseId, sources, options);
  }

  /**
   * Re-ingest a document (useful after content updates)
   */
  async reingestDocument(
    tenantId: string,
    documentId: string,
    options: IngestionOptions = {},
  ): Promise<IngestionResult> {
    const document = await this.prisma.withTenant(tenantId, async (tx) => {
      const doc = await tx.knowledgeBaseDocument.findFirst({
        where: { id: documentId, tenantId },
        include: {
          knowledgeBase: {
            select: {
              id: true,
              embeddingProvider: true,
              embeddingModel: true,
              embeddingDimensions: true,
            },
          },
        },
      });

      if (!doc) {
        throw new Error(`Document not found: ${documentId}`);
      }

      // Delete existing chunks
      await tx.knowledgeChunk.deleteMany({
        where: { documentId, tenantId },
      });

      // Reset document status
      await tx.knowledgeBaseDocument.update({
        where: { id: documentId },
        data: { status: 'pending', chunkCount: 0, errorMessage: null },
      });

      return doc;
    });

    // Re-ingest preserving knowledge base's configured provider and model
    return this.ingestDocument(
      tenantId,
      document.knowledgeBaseId,
      {
        type: document.sourceType as any,
        reference: document.sourceRef ?? '',
        title: document.title,
        content: document.content,
        mimeType: document.mimeType || undefined,
        fileSize: document.fileSize || undefined,
        metadata: document.metadata as Record<string, any>,
      },
      {
        ...options,
        embeddingProvider: options.embeddingProvider || document.knowledgeBase?.embeddingProvider,
        embeddingModel: options.embeddingModel || document.knowledgeBase?.embeddingModel,
      },
    );
  }

  /**
   * Delete a document and its chunks
   */
  async deleteDocument(tenantId: string, documentId: string): Promise<void> {
    await this.prisma.withTenant(tenantId, async (tx) => {
      await tx.knowledgeBaseDocument.deleteMany({
        where: { id: documentId, tenantId },
      });
    });
  }

  /**
   * Get ingestion status
   */
  async getDocumentStatus(tenantId: string, documentId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      return tx.knowledgeBaseDocument.findFirst({
        where: { id: documentId, tenantId },
        include: { chunks: { select: { id: true } } },
      });
    });
  }

  /**
   * List documents in a knowledge base
   */
  async listDocuments(tenantId: string, knowledgeBaseId: string, status?: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      return tx.knowledgeBaseDocument.findMany({
        where: {
          tenantId,
          knowledgeBaseId,
          ...(status ? { status } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  }


  /**
   * Chunk text into overlapping segments
   */
  private chunkText(text: string, chunkSize: number, chunkOverlap: number): Array<{ content: string; metadata: Record<string, any> }> {
    const chunks: Array<{ content: string; metadata: Record<string, any> }> = [];
    
    // Simple paragraph-based chunking first
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    
    let currentChunk = '';
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      const paragraphText = paragraph.trim();
      
      // If adding this paragraph exceeds chunk size, finalize current chunk
      if (currentChunk.length + paragraphText.length > chunkSize && currentChunk.length > 0) {
        chunks.push({
          content: currentChunk.trim(),
          metadata: { chunkIndex, chunkMethod: 'paragraph' },
        });
        
        // Start new chunk with overlap
        const overlapText = this.getOverlap(currentChunk, chunkOverlap);
        currentChunk = overlapText + '\n\n' + paragraphText;
        chunkIndex++;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraphText;
      }
    }

    // Add final chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        metadata: { chunkIndex, chunkMethod: 'paragraph' },
      });
    }

    // If chunks are still too large, split further by sentences
    return this.splitLargeChunks(chunks, chunkSize, chunkOverlap);
  }

  /**
   * Split chunks that exceed the size limit
   */
  private splitLargeChunks(
    chunks: Array<{ content: string; metadata: Record<string, any> }>,
    chunkSize: number,
    chunkOverlap: number,
  ): Array<{ content: string; metadata: Record<string, any> }> {
    const result: Array<{ content: string; metadata: Record<string, any> }> = [];

    for (const chunk of chunks) {
      if (chunk.content.length <= chunkSize) {
        result.push(chunk);
        continue;
      }

      // Split by sentences
      const sentences = chunk.content.split(/(?<=[.!?])\s+/);
      let currentChunk = '';
      let sentenceIndex = 0;

      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
          result.push({
            content: currentChunk.trim(),
            metadata: { ...chunk.metadata, subChunk: true, subChunkIndex: sentenceIndex++ },
          });
          currentChunk = this.getOverlap(currentChunk, chunkOverlap) + ' ' + sentence;
        } else {
          currentChunk += (currentChunk ? ' ' : '') + sentence;
        }
      }

      if (currentChunk.trim().length > 0) {
        result.push({
          content: currentChunk.trim(),
          metadata: { ...chunk.metadata, subChunk: true, subChunkIndex: sentenceIndex },
        });
      }
    }

    return result;
  }

  /**
   * Get overlap text from the end of a chunk
   */
  private getOverlap(text: string, overlapSize: number): string {
    if (text.length <= overlapSize) return text;
    // Try to find a sentence boundary within the overlap region
    const overlapRegion = text.slice(-overlapSize);
    const sentenceMatch = overlapRegion.match(/[.!?]\s+([^.!?]*$)/);
    if (sentenceMatch) {
      return sentenceMatch[0].trim();
    }
    return overlapRegion.trim();
  }

  /**
   * Estimate token count (rough approximation: 1 token ≈ 4 chars)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Generate SHA256 hash of content
   */
  private hashContent(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

}