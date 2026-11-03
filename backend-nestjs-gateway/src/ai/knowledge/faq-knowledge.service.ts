import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

export interface ApprovedFaqEntry {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  rank?: number;
}

@Injectable()
export class FaqKnowledgeService {
  private readonly logger = new Logger(FaqKnowledgeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search tenant-approved FAQ knowledge entries using PostgreSQL full-text search (GIN tsvector)
   * with ranking by ts_rank_cd, as specified in Database Design Document §12.4 and §3.6.
   *
   * Only rows where status = 'approved' and tenant_id = :tenantId are ever retrievable.
   */
  async searchApprovedFaqs(
    tenantId: string,
    query: string,
    limit = 5,
  ): Promise<ApprovedFaqEntry[]> {
    if (!tenantId || !query || query.trim().length === 0) {
      return [];
    }

    const cleanQuery = query.trim();

    try {
      // 1. Primary: PostgreSQL full-text search over generated search_tsv
      // Ranked by ts_rank_cd descending, tenant filter first
      const fullTextResults = await this.prisma.$queryRaw<
        Array<{
          id: string;
          question: string;
          answer: string;
          tags: string[];
          rank: number;
        }>
      >`
        SELECT
          id,
          question,
          answer,
          tags,
          ts_rank_cd(search_tsv, plainto_tsquery('english', ${cleanQuery})) AS rank
        FROM config.faq_entries
        WHERE tenant_id = ${tenantId}::uuid
          AND status = 'approved'
          AND search_tsv @@ plainto_tsquery('english', ${cleanQuery})
        ORDER BY rank DESC
        LIMIT ${limit};
      `;

      if (fullTextResults && fullTextResults.length > 0) {
        return fullTextResults.map((r) => ({
          id: r.id,
          question: r.question,
          answer: r.answer,
          tags: r.tags || [],
          rank: Number(r.rank),
        }));
      }

      // 2. Secondary fallback: ILIKE search on question or tags if full-text returned no matches
      // (useful for partial words or specific studio terminology)
      const keywordPattern = `%${cleanQuery}%`;
      const fallbackResults = await this.prisma.$queryRaw<
        Array<{
          id: string;
          question: string;
          answer: string;
          tags: string[];
        }>
      >`
        SELECT
          id,
          question,
          answer,
          tags
        FROM config.faq_entries
        WHERE tenant_id = ${tenantId}::uuid
          AND status = 'approved'
          AND (
            question ILIKE ${keywordPattern}
            OR answer ILIKE ${keywordPattern}
            OR ${cleanQuery} = ANY(tags)
          )
        ORDER BY created_at DESC
        LIMIT ${limit};
      `;

      return (fallbackResults || []).map((r) => ({
        id: r.id,
        question: r.question,
        answer: r.answer,
        tags: r.tags || [],
      }));
    } catch (error) {
      this.logger.warn(
        `Failed to retrieve FAQ entries for tenant ${tenantId}: ${(error as Error).message}`,
      );
      // Safe error handling: Return empty array on database error or missing table
      // Never fabricate responses
      return [];
    }
  }

  /**
   * List all approved FAQ entries for a tenant (e.g. for studio catalog overview)
   */
  async getApprovedFaqList(tenantId: string, limit = 20): Promise<ApprovedFaqEntry[]> {
    if (!tenantId) return [];

    try {
      const entries = await this.prisma.$queryRaw<
        Array<{
          id: string;
          question: string;
          answer: string;
          tags: string[];
        }>
      >`
        SELECT
          id,
          question,
          answer,
          tags
        FROM config.faq_entries
        WHERE tenant_id = ${tenantId}::uuid
          AND status = 'approved'
        ORDER BY created_at DESC
        LIMIT ${limit};
      `;

      return (entries || []).map((r) => ({
        id: r.id,
        question: r.question,
        answer: r.answer,
        tags: r.tags || [],
      }));
    } catch (error) {
      this.logger.warn(
        `Failed to list approved FAQs for tenant ${tenantId}: ${(error as Error).message}`,
      );
      return [];
    }
  }
}
