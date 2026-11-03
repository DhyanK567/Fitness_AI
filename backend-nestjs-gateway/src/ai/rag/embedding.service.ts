import { Injectable, OnModuleInit, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';

export const RAG_EMBEDDING_DIMENSIONS = 1536;

export interface EmbeddingOptions {
  model?: string;
  inputType?: 'document' | 'query';
  dimensions?: number;
}

export interface EmbeddingProvider {
  name: string;
  model: string;
  dimensions: number;
  embed(texts: string[], options?: EmbeddingOptions): Promise<number[][]>;
  embedSingle(text: string, options?: EmbeddingOptions): Promise<number[]>;
}

interface OpenAIEmbeddingResponse {
  object: 'list';
  data: Array<{
    object: 'embedding';
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Validate embedding vector array structure, dimensions, and finite numbers.
 */
export function validateEmbeddingVectors(
  vectors: number[][],
  expectedCount: number,
  expectedDimensions: number,
  providerName: string,
  modelName: string,
): void {
  if (!Array.isArray(vectors) || vectors.length !== expectedCount) {
    throw new Error(
      `Embedding provider "${providerName}" (${modelName}) returned invalid vector count: expected ${expectedCount}, got ${Array.isArray(vectors) ? vectors.length : 'non-array'}.`
    );
  }
  for (let i = 0; i < vectors.length; i++) {
    const vec = vectors[i];
    if (!Array.isArray(vec) || vec.length !== expectedDimensions) {
      throw new Error(
        `Embedding dimension mismatch from "${providerName}" (${modelName}) at index ${i}: expected ${expectedDimensions}, got ${Array.isArray(vec) ? vec.length : 'non-array'}.`
      );
    }
    for (let j = 0; j < vec.length; j++) {
      if (typeof vec[j] !== 'number' || !Number.isFinite(vec[j])) {
        throw new Error(
          `Embedding vector from "${providerName}" (${modelName}) contains non-finite number at index ${i}, dimension ${j}.`
        );
      }
    }
  }
}

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  private providers: Map<string, EmbeddingProvider> = new Map();
  private defaultProvider: string = 'openai';

  constructor(
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async onModuleInit() {
    // Initialize default OpenAI provider
    const openaiApiKey = this.config?.get<string>('OPENAI_API_KEY') || process.env.OPENAI_API_KEY;
    if (openaiApiKey) {
      this.providers.set('openai', new OpenAIEmbeddingProvider(openaiApiKey, this.config));
    }

    // Cohere does not support 1536-dimensional embeddings required by pgvector vector(1536) schema
    const cohereApiKey = this.config?.get<string>('COHERE_API_KEY') || process.env.COHERE_API_KEY;
    if (cohereApiKey) {
      this.logger.warn(
        `Cohere credentials configured, but Cohere models produce 1024-dimensional embeddings which are incompatible with the 1536-dimensional RAG vector schema. Cohere is not registered for RAG.`
      );
    }

    // Initialize local/huggingface provider if configured and compatible
    const localEmbeddingUrl = this.config?.get<string>('LOCAL_EMBEDDING_URL') || process.env.LOCAL_EMBEDDING_URL;
    if (localEmbeddingUrl) {
      const localDims = Number(this.config?.get<number>('LOCAL_EMBEDDING_DIMENSIONS') || process.env.LOCAL_EMBEDDING_DIMENSIONS) || RAG_EMBEDDING_DIMENSIONS;
      if (localDims === RAG_EMBEDDING_DIMENSIONS) {
        this.providers.set('local', new LocalEmbeddingProvider(localEmbeddingUrl, this.config));
      } else {
        this.logger.warn(
          `Local embedding provider configured with ${localDims} dimensions, but 1536 dimensions are required. Local provider is not registered for RAG.`
        );
      }
    }

    this.defaultProvider = this.config?.get<string>('DEFAULT_EMBEDDING_PROVIDER') || process.env.DEFAULT_EMBEDDING_PROVIDER || 'openai';

    if (!this.providers.has(this.defaultProvider)) {
      const available = Array.from(this.providers.keys()).join(', ');
      this.logger.warn(
        `Default embedding provider "${this.defaultProvider}" is not configured (available: ${available || 'none'}). ` +
        `RAG embedding and vector search capabilities will remain unavailable until valid provider credentials are provided.`
      );
    } else {
      this.logger.log(`Initialized default embedding provider: ${this.defaultProvider}`);
    }
  }

  isAvailable(name?: string): boolean {
    const providerName = name || this.defaultProvider;
    if (providerName === 'cohere') return false;
    return this.providers.has(providerName);
  }

  getProvider(name?: string): EmbeddingProvider {
    const providerName = name || this.defaultProvider;
    if (providerName === 'cohere') {
      throw new Error(
        `Embedding provider "cohere" (1024 dimensions) is incompatible with the 1536-dimensional RAG vector schema and cannot be used.`
      );
    }
    const provider = this.providers.get(providerName);
    if (!provider) {
      const available = Array.from(this.providers.keys()).join(', ');
      throw new Error(
        `Embedding provider "${providerName}" is not available (configured: ${available || 'none'}). ` +
        `Please configure credentials for "${providerName}" (e.g. OPENAI_API_KEY) or set DEFAULT_EMBEDDING_PROVIDER.`
      );
    }
    return provider;
  }

  async embed(texts: string[], providerName?: string, options?: EmbeddingOptions): Promise<number[][]> {
    const provider = this.getProvider(providerName);
    return provider.embed(texts, options);
  }

  async embedSingle(text: string, providerName?: string, options?: EmbeddingOptions): Promise<number[]> {
    const provider = this.getProvider(providerName);
    return provider.embedSingle(text, options);
  }

  getDimensions(providerName?: string): number {
    const provider = this.getProvider(providerName);
    return provider.dimensions;
  }

  getModel(providerName?: string): string {
    const provider = this.getProvider(providerName);
    return provider.model;
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

/**
 * OpenAI Embedding Provider
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly model: string;
  readonly dimensions: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, config?: ConfigService) {
    this.apiKey = apiKey;
    this.model = config?.get<string>('OPENAI_EMBEDDING_MODEL') || process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    this.dimensions = RAG_EMBEDDING_DIMENSIONS;
    this.baseUrl = config?.get<string>('OPENAI_BASE_URL') || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  }

  async embed(texts: string[], options?: EmbeddingOptions): Promise<number[][]> {
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new Error('OpenAI embedding failed: input texts array must not be empty.');
    }
    for (let i = 0; i < texts.length; i++) {
      if (typeof texts[i] !== 'string') {
        throw new Error(`OpenAI embedding failed: input text at index ${i} is not a string.`);
      }
    }

    const activeModel = options?.model || this.model;
    const targetDimensions = options?.dimensions || this.dimensions;

    // text-embedding-3-small and text-embedding-3-large support 'dimensions' parameter.
    // text-embedding-ada-002 does NOT support 'dimensions' parameter (API throws 400).
    const requestBody: Record<string, any> = {
      model: activeModel,
      input: texts,
      encoding_format: 'float',
    };

    if (activeModel.startsWith('text-embedding-3-')) {
      requestBody.dimensions = targetDimensions;
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(`OpenAI embedding failed: ${error.error?.message || response.statusText}`);
    }

    const data: OpenAIEmbeddingResponse = await response.json();
    if (!data || !Array.isArray(data.data)) {
      throw new Error(`OpenAI embedding failed: received malformed response payload.`);
    }

    const sortedEmbeddings = data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
    validateEmbeddingVectors(sortedEmbeddings, texts.length, targetDimensions, 'openai', activeModel);
    return sortedEmbeddings;
  }

  async embedSingle(text: string, options?: EmbeddingOptions): Promise<number[]> {
    const [embedding] = await this.embed([text], options);
    return embedding;
  }
}

/**
 * Cohere Embedding Provider
 */
export class CohereEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'cohere';
  readonly model: string;
  readonly dimensions: number = 1024;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, config?: ConfigService) {
    this.apiKey = apiKey;
    this.model = config?.get<string>('COHERE_EMBEDDING_MODEL') || process.env.COHERE_EMBEDDING_MODEL || 'embed-english-v3.0';
    this.dimensions = 1024;
    this.baseUrl = config?.get<string>('COHERE_BASE_URL') || process.env.COHERE_BASE_URL || 'https://api.cohere.ai/v1';
  }

  async embed(texts: string[], options?: EmbeddingOptions): Promise<number[][]> {
    const targetDimensions = options?.dimensions || RAG_EMBEDDING_DIMENSIONS;
    if (targetDimensions === RAG_EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Cohere embedding provider (model "${this.model}", 1024 dimensions) cannot produce ` +
        `1536-dimensional vectors required by the RAG vector schema. Cohere is not supported for this schema.`
      );
    }

    const inputType = options?.inputType === 'query' ? 'search_query' : 'search_document';
    const activeModel = options?.model || this.model;

    const response = await fetch(`${this.baseUrl}/embed`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: activeModel,
        texts,
        input_type: inputType,
        embedding_types: ['float'],
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(`Cohere embedding failed: ${error.message || response.statusText}`);
    }

    const data = await response.json();
    if (!data || !data.embeddings || !Array.isArray(data.embeddings.float)) {
      throw new Error(`Cohere embedding failed: received malformed response payload.`);
    }

    const embeddings = data.embeddings.float;
    validateEmbeddingVectors(embeddings, texts.length, this.dimensions, 'cohere', activeModel);
    return embeddings;
  }

  async embedSingle(text: string, options?: EmbeddingOptions): Promise<number[]> {
    const [embedding] = await this.embed([text], options);
    return embedding;
  }
}

/**
 * Local Embedding Provider (e.g., Ollama, Text Embeddings Inference)
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'local';
  readonly model: string;
  readonly dimensions: number;
  private readonly baseUrl: string;

  constructor(baseUrl: string, config?: ConfigService) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = config?.get<string>('LOCAL_EMBEDDING_MODEL') || process.env.LOCAL_EMBEDDING_MODEL || 'local-model';
    this.dimensions = Number(config?.get<number>('LOCAL_EMBEDDING_DIMENSIONS') || process.env.LOCAL_EMBEDDING_DIMENSIONS) || RAG_EMBEDDING_DIMENSIONS;
  }

  async embed(texts: string[], options?: EmbeddingOptions): Promise<number[][]> {
    const activeModel = options?.model || this.model;
    const targetDimensions = options?.dimensions || this.dimensions;

    if (targetDimensions !== RAG_EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Local embedding provider configured with ${targetDimensions} dimensions, but 1536 dimensions are required by the RAG vector schema.`
      );
    }

    const response = await fetch(`${this.baseUrl}/embed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: texts,
        model: activeModel,
      }),
    });

    if (!response.ok) {
      throw new Error(`Local embedding failed: ${response.statusText}`);
    }

    const data = await response.json();
    let rawVectors: number[][];
    if (Array.isArray(data)) {
      rawVectors = data;
    } else if (data?.embeddings && Array.isArray(data.embeddings)) {
      rawVectors = data.embeddings;
    } else if (data?.data && Array.isArray(data.data)) {
      rawVectors = data.data.map((d: any) => d.embedding);
    } else {
      throw new Error('Local embedding failed: unexpected response format.');
    }

    validateEmbeddingVectors(rawVectors, texts.length, targetDimensions, 'local', activeModel);
    return rawVectors;
  }

  async embedSingle(text: string, options?: EmbeddingOptions): Promise<number[]> {
    const [embedding] = await this.embed([text], options);
    return embedding;
  }
}