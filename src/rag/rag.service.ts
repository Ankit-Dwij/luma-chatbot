import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { BufferMemory } from 'langchain/memory';
import { ConversationalRetrievalQAChain } from 'langchain/chains';
import { PineconeStore } from '@langchain/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { ChatOpenAI } from '@langchain/openai';
import { Pinecone, Index as PineconeIndex } from '@pinecone-database/pinecone';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatResponseDto } from './dto/chat-response.dto';

@Injectable()
export class RAGServiceWithLangChain {
  private vectorStore: PineconeStore;
  private llm: ChatOpenAI;
  private conversations: Map<string, ConversationalRetrievalQAChain>;
  private embeddings: OpenAIEmbeddings;
  private pineconeIndex: PineconeIndex;
  private initialized = false;

  constructor(private readonly configService: ConfigService) {
    this.conversations = new Map();
  }

  private async initialize() {
    if (this.initialized) return;

    // Initialize LLM
    this.llm = new ChatOpenAI({
      modelName: this.configService.get<string>('app.openai.model'),
      apiKey: this.configService.get<string>('app.openai.apiKey'),
      temperature: 0.3,
    });

    // Initialize embeddings
    this.embeddings = new OpenAIEmbeddings({
      modelName: 'text-embedding-ada-002',
      apiKey: this.configService.getOrThrow<string>('app.openai.apiKey'),
    });

    // Initialize Pinecone client
    const pineconeApiKey = this.configService.getOrThrow<string>(
      'app.pinecone.apiKey',
    );
    // const pineconeHost = this.configService.get<string>('app.pinecone.host');
    // const pineconeEnv = this.configService.get<string>(
    //   'app.pinecone.environment',
    // );

    const config = {
      apiKey: pineconeApiKey,
      // ...(pineconeHost ? { host: pineconeHost } : {}),
      // ...(pineconeEnv ? { environment: pineconeEnv } : {}),
    };

    const pinecone = new Pinecone(config);
    const indexName = this.configService.getOrThrow<string>(
      'app.pinecone.indexName',
    );
    this.pineconeIndex = pinecone.Index(indexName);

    // Initialize vector store
    try {
      this.vectorStore = await PineconeStore.fromExistingIndex(
        this.embeddings,
        { pineconeIndex: this.pineconeIndex },
      );
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize vector store:', error);
      throw error;
    }
  }

  // Step 1: Ingest data using LangChain loaders
  async ingestCSV(filePath: string) {
    await this.initialize();

    try {
      // Load CSV
      const loader = new CSVLoader(filePath);
      const docs = await loader.load();

      // Split into chunks
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });
      const chunks = await splitter.splitDocuments(docs);

      if (!this.embeddings || !this.pineconeIndex) {
        throw new Error('Embeddings or Pinecone index not initialized');
      }

      // Store documents in the existing vector store
      this.vectorStore = await PineconeStore.fromDocuments(
        chunks,
        this.embeddings,
        {
          pineconeIndex: this.pineconeIndex,
        },
      );

      return { processedDocs: docs.length, chunks: chunks.length };
    } catch (error) {
      console.error('Error ingesting CSV:', error);
      throw new Error(`Failed to ingest CSV: ${(error as Error).message}`);
    }
  }

  // Step 2: Query with conversation memory
  async query(
    conversationId: string,
    question: string,
    filter?: Record<string, any>,
  ): Promise<ChatResponseDto> {
    await this.initialize();

    // Get or create conversation chain
    if (!this.conversations.has(conversationId)) {
      const memory = new BufferMemory({
        memoryKey: 'chat_history',
        returnMessages: true,
        outputKey: 'text',
      });

      if (!this.vectorStore) {
        throw new Error('Vector store not initialized');
      }

      const chain = ConversationalRetrievalQAChain.fromLLM(
        this.llm,
        this.vectorStore.asRetriever({
          k: 5,
          filter, // Metadata filtering
        }),
        {
          memory,
          returnSourceDocuments: true,
        },
      );

      this.conversations.set(conversationId, chain);
    }

    const chain = this.conversations.get(conversationId)!;

    try {
      // Execute query
      const response = await chain.invoke({ question });

      if (!response || typeof response.text !== 'string') {
        throw new Error('Invalid response from LLM');
      }

      const sourceDocuments = Array.isArray(response.sourceDocuments)
        ? response.sourceDocuments
        : [];

      return {
        answer: response.text,
        sources: sourceDocuments.map((doc: Record<string, unknown>) => ({
          content: typeof doc?.pageContent === 'string' ? doc.pageContent : '',
          metadata:
            typeof doc?.metadata === 'object' && doc.metadata !== null
              ? (doc.metadata as Record<string, any>)
              : {},
        })),
      };
    } catch (error) {
      console.error('Error executing query:', error);
      throw new Error(`Failed to process query: ${(error as Error).message}`);
    }
  }

  // Clear conversation history
  clearConversation(conversationId: string) {
    this.conversations.delete(conversationId);
  }
}
