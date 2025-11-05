export type AppConfig = {
  openai: {
    apiKey: string;
    model: string;
    embeddingModel: string;
  };
  pinecone: {
    apiKey: string;
    environment: string;
    indexName: string;
    // Optional: host URL for Pinecone managed endpoints (e.g. https://...)
    host?: string;
    // Metric used by the index (e.g. "cosine")
    metric?: string;
    // Index vector dimensions (e.g. 1024)
    dimensions?: number;
    // Model name configured for the index (informational)
    model?: string;
  };
  app: {
    port: number;
  };
};
