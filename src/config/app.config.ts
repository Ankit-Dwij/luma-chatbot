import { registerAs } from '@nestjs/config';
import { AppConfig } from './app-config.type';

export default registerAs<AppConfig>('app', () => {
  return {
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      embeddingModel:
        process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    },
    pinecone: {
      apiKey: process.env.PINECONE_API_KEY || '',
      environment: process.env.PINECONE_ENVIRONMENT || 'us-east-1',
      indexName: process.env.PINECONE_INDEX_NAME || 'event-attendees',
      // Optional host for managed Pinecone endpoints (set PINECONE_HOST to override)
      host: process.env.PINECONE_HOST || '',
      // Metric (cosine, euclidean, dotproduct) - informational
      metric: process.env.PINECONE_METRIC || 'cosine',
      // Dimensions of the index vectors (number) - informational
      dimensions: parseInt(process.env.PINECONE_DIMENSIONS || '1024', 10),
      // Model name configured for the index (informational)
      model: process.env.PINECONE_MODEL || '',
    },
    app: {
      port: parseInt(process.env.PORT || '3000', 10),
    },
  };
});
