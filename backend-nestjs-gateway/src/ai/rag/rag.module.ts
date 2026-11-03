import { Module, Global } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { RetrievalService } from './retrieval.service';
import { DocumentIngestionService } from './document-ingestion.service';
import { SearchKnowledgeBaseTool } from '../tools/rag-tools';
import { IngestDocumentTool } from '../tools/rag-tools';
import { IngestFAQTool } from '../tools/rag-tools';
import { ListKnowledgeBasesTool } from '../tools/rag-tools';
import { DeleteDocumentTool } from '../tools/rag-tools';
import { GetDocumentStatusTool } from '../tools/rag-tools';

@Global()
@Module({
  providers: [
    EmbeddingService,
    RetrievalService,
    DocumentIngestionService,
    SearchKnowledgeBaseTool,
    IngestDocumentTool,
    IngestFAQTool,
    ListKnowledgeBasesTool,
    DeleteDocumentTool,
    GetDocumentStatusTool,
  ],
  exports: [
    EmbeddingService,
    RetrievalService,
    DocumentIngestionService,
    SearchKnowledgeBaseTool,
    IngestDocumentTool,
    IngestFAQTool,
    ListKnowledgeBasesTool,
    DeleteDocumentTool,
    GetDocumentStatusTool,
  ],
})
export class RagModule {}