import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { PineconeStore } from '@langchain/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { ChatOpenAI } from '@langchain/openai';
import { Pinecone, Index as PineconeIndex } from '@pinecone-database/pinecone';
import { Document } from 'langchain/document';
import { Logger } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import * as Papa from 'papaparse';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import { createHistoryAwareRetriever } from 'langchain/chains/history_aware_retriever';
import { MessagesPlaceholder } from '@langchain/core/prompts';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { RunnableLambda } from '@langchain/core/runnables';
import { BM25Retriever } from '@langchain/community/retrievers/bm25';

// Local result types used by the service
export type EventMetadata = {
  event_api_id: string;
  event_name: string;
  event_url: string;
  start_at: string;
  end_at: string;
  timezone: string;
  location_type: string;
  event_type: string;
  visibility: string;
  guest_count: string;
  ticket_count: string;
  is_free: string;
  require_approval: string;
  calendar_name: string;
  calendar_api_id: string;
  city: string;
  region: string;
  country: string;
  full_address: string;
  latitude: string;
  longitude: string;
  cover_url: string;
  hosts: string;
  host_ids: string;
};

export type GuestMetadata = {
  event_api_id: string;
  event_name: string;
  guest_api_id: string;
  guest_name: string;
  username: string;
  website: string;
  timezone: string;
  bio_short: string;
  avatar_url: string;
  twitter_handle: string;
  linkedin_handle: string;
  instagram_handle: string;
  youtube_handle: string;
  tiktok_handle: string;
  last_online_at: string;
  num_tickets_registered: string;
  section_label: string;
};

export type IngestResult = {
  processedDocs: number;
  chunks: number;
  success: boolean;
  message: string;
};

export type QueryResult = {
  answer: string;
  sources: Array<{ content: string; metadata: Record<string, any> }>;
};

@Injectable()
export class RAGServiceWithLangChain {
  private vectorStore: PineconeStore;
  private llm: ChatOpenAI;
  private conversations: Map<
    string,
    {
      chain: any;
      chatHistory: Array<HumanMessage | AIMessage>;
    }
  > = new Map();
  private embeddings: OpenAIEmbeddings;
  private pineconeIndex: PineconeIndex;
  private pineconeClient: Pinecone;
  private readonly logger = new Logger(RAGServiceWithLangChain.name);
  private initialized = false;
  private readonly projectRoot = process.cwd();

  // 🔹 In-memory CSV data for lexical search
  private allEvents: EventMetadata[] | null = null;
  private allGuests: GuestMetadata[] | null = null;

  private resolvePath(filePath: string): string {
    // If it's already an absolute path starting with /, return as is
    if (filePath.startsWith('/')) {
      return filePath;
    }
    // Otherwise join with project root
    return join(this.projectRoot, filePath);
  }

  constructor(private readonly configService: ConfigService) {
    this.conversations = new Map();
  }

  private async loadCsvDataIfNeeded() {
    if (this.allEvents && this.allGuests) return;

    const eventsPath = this.resolvePath('data/events.csv');
    const guestsPath = this.resolvePath('data/all_guests.csv');

    this.logger.log(`Loading CSV data into memory:
      Events: ${eventsPath}
      Guests: ${guestsPath}
    `);

    const [eventsFileContent, guestsFileContent] = await Promise.all([
      fs.readFile(eventsPath, 'utf-8'),
      fs.readFile(guestsPath, 'utf-8'),
    ]);

    const parsedEvents = Papa.parse<EventMetadata>(eventsFileContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
    });

    const parsedGuests = Papa.parse<GuestMetadata>(guestsFileContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
    });

    this.allEvents = parsedEvents.data.filter(
      (e) => !!e.event_api_id && !!e.event_name,
    );
    this.allGuests = parsedGuests.data.filter(
      (g) => !!g.guest_api_id && !!g.guest_name,
    );

    this.logger.log(
      `Loaded ${this.allEvents.length} events and ${this.allGuests.length} guests into memory`,
    );
  }

  private guestBm25: BM25Retriever | null = null;

  private async buildGuestBm25Index() {
    await this.loadCsvDataIfNeeded();
    if (!this.allGuests || this.allGuests.length === 0) return;

    const docs = this.allGuests.map((guest) => {
      // 🚫 Strip name + all social fields from what goes into metadata
      const {
        guest_name,
        username,
        twitter_handle,
        linkedin_handle,
        instagram_handle,
        youtube_handle,
        tiktok_handle,
        // you can add more here if new social fields are added
        ...safeGuest
      } = guest;

      return new Document({
        pageContent: `
          ${guest.event_name}
          ${guest.bio_short}
        `.trim(),
        metadata: {
          doc_type: 'guest_bm25',
          // ✅ Only safe fields are exposed here
          ...safeGuest,
        },
      });
    });

    this.guestBm25 = await BM25Retriever.fromDocuments(docs, {
      k: 30, // how many BM25 hits you want per query
    });
  }

  private async lexicalSearchDocs(
    query: string,
    filter?: Record<string, any>,
  ): Promise<Document[]> {
    await this.buildGuestBm25Index();
    if (!this.guestBm25) return [];

    // 🧹 Sanitize query for BM25 to avoid invalid regex tokens like "?"
    const safeQuery = (query || '')
      // replace non-letter/digit/space with space
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!safeQuery) {
      this.logger.warn(
        `lexicalSearchDocs: query "${query}" became empty after sanitization, skipping BM25`,
      );
      return [];
    }

    let docs: Document[] = [];
    try {
      docs = await this.guestBm25.getRelevantDocuments(safeQuery);
    } catch (err) {
      this.logger.error(
        `BM25 getRelevantDocuments failed for query "${safeQuery}": ${
          (err as Error).message
        }`,
      );
      return [];
    }

    // Optional: post-filter by event if filter has event_api_id
    if (filter?.event_api_id) {
      docs = docs.filter(
        (d) => d.metadata?.event_api_id === filter.event_api_id,
      );
    }

    const MAX_LEXICAL_DOCS = 30;
    return docs.slice(0, MAX_LEXICAL_DOCS);
  }

  private async initialize() {
    if (this.initialized) return;

    // Initialize LLM
    this.llm = new ChatOpenAI({
      modelName: this.configService.get<string>('app.openai.model'),
      apiKey: this.configService.get<string>('app.openai.apiKey'),
      // temperature: 0.3,
    });

    // Initialize embeddings
    this.embeddings = new OpenAIEmbeddings({
      modelName: 'text-embedding-3-small',
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
    };

    this.pineconeClient = new Pinecone(config);
    const indexName = this.configService.getOrThrow<string>(
      'app.pinecone.indexName',
    );
    this.pineconeIndex = this.pineconeClient.Index(indexName);

    // Initialize vector store
    try {
      this.vectorStore = await PineconeStore.fromExistingIndex(
        this.embeddings,
        { pineconeIndex: this.pineconeIndex },
      );

      // 🔹 Load CSV data once at startup for lexical search
      await this.loadCsvDataIfNeeded();

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize vector store:', error);
      throw error;
    }
  }

  // Ingest two CSVs (events + guests) and store into Pinecone
  async ingestBothCSVs(
    eventsFilePath: string,
    guestsFilePath: string,
  ): Promise<IngestResult> {
    await this.initialize();

    try {
      this.logger.log('Starting dual CSV ingestion...');

      const allDocs: Document[] = [];

      // Resolve paths relative to project root
      const resolvedEventsPath = this.resolvePath(eventsFilePath);
      const resolvedGuestsPath = this.resolvePath(guestsFilePath);

      this.logger.log(`Resolved paths:
        Events: ${resolvedEventsPath}
        Guests: ${resolvedGuestsPath}
      `);

      // ============= EVENTS =============
      // Check if files exist
      try {
        await fs.access(resolvedEventsPath);
        await fs.access(resolvedGuestsPath);
      } catch (error) {
        throw new Error(
          `File access error: ${(error as Error).message}. Make sure the files exist in the data directory.`,
        );
      }

      this.logger.log(`Loading events from: ${resolvedEventsPath}`);
      let eventDocs: Document[] = [];
      try {
        const eventsFileContent = await fs.readFile(
          resolvedEventsPath,
          'utf-8',
        );
        const parsedEvents = Papa.parse<EventMetadata>(eventsFileContent, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (header) => header.trim(),
        });

        if (parsedEvents.errors.length > 0) {
          this.logger.error('CSV parsing errors:', parsedEvents.errors);
        }

        eventDocs = parsedEvents.data.map((row, index) => {
          return new Document({
            pageContent: JSON.stringify(row),
            metadata: {
              source: resolvedEventsPath,
              line: index + 2,
              ...row,
            },
          });
        });

        this.logger.log(
          `Raw event docs loaded: ${JSON.stringify(
            eventDocs[0]?.metadata || {},
            null,
            2,
          )}`,
        );
        if (!eventDocs || eventDocs.length === 0) {
          throw new Error('No events loaded from CSV');
        }
      } catch (error) {
        this.logger.error(
          `Error loading events CSV: ${(error as Error).message}`,
        );
        throw error;
      }

      const enrichedEventDocs = eventDocs.map((doc) => {
        const metadata = (doc.metadata || {}) as EventMetadata;

        // ✅ Keep both: human-readable text + structured metadata
        const semanticText = `
Event Name: ${metadata.event_name}
Event ID: ${metadata.event_api_id}
Location: ${metadata.city}, ${metadata.region}, ${metadata.country}
Address: ${metadata.full_address}
Start Date: ${metadata.start_at}
End Date: ${metadata.end_at}
Timezone: ${metadata.timezone}
Event Type: ${metadata.location_type} ${metadata.event_type}
Total Guests: ${metadata.guest_count} attendees
Total Tickets: ${metadata.ticket_count}
Free Event: ${metadata.is_free}
Requires Approval: ${metadata.require_approval}
Calendar: ${metadata.calendar_name}
Calendar ID: ${metadata.calendar_api_id}
Hosts: ${metadata.hosts}
Cover Image: ${metadata.cover_url}
Event URL: https://lu.ma/${metadata.event_url}
      `.trim();

        return new Document({
          pageContent: semanticText,
          metadata: {
            // ✅ Keep ALL original metadata for filtering
            doc_type: 'event',
            event_api_id: metadata.event_api_id,
            event_name: metadata.event_name,
            event_url: metadata.event_url,
            start_at: metadata.start_at,
            end_at: metadata.end_at,
            timezone: metadata.timezone,
            location_type: metadata.location_type,
            event_type: metadata.event_type,
            visibility: metadata.visibility,
            guest_count: parseInt(metadata.guest_count) || 0,
            ticket_count: parseInt(metadata.ticket_count) || 0,
            is_free: metadata.is_free === 'true',
            require_approval: metadata.require_approval === 'true',
            calendar_name: metadata.calendar_name,
            calendar_api_id: metadata.calendar_api_id,
            city: metadata.city,
            region: metadata.region,
            country: metadata.country,
            full_address: metadata.full_address,
            latitude: parseFloat(metadata.latitude) || null,
            longitude: parseFloat(metadata.longitude) || null,
            cover_url: metadata.cover_url,
            hosts: metadata.hosts,
            host_ids: metadata.host_ids,
          },
        });
      });

      allDocs.push(...enrichedEventDocs);
      this.logger.log(`Loaded ${eventDocs.length} event documents`);

      // ============= GUESTS =============
      this.logger.log(`Loading guests from: ${resolvedGuestsPath}`);
      const guestsFileContent = await fs.readFile(resolvedGuestsPath, 'utf-8');
      const parsedGuests = Papa.parse<GuestMetadata>(guestsFileContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
      });

      if (parsedGuests.errors.length > 0) {
        this.logger.error('CSV parsing errors:', parsedGuests.errors);
      }

      const guestDocs = parsedGuests.data.map((row, index) => {
        return new Document({
          pageContent: JSON.stringify(row),
          metadata: {
            source: resolvedGuestsPath,
            line: index + 2,
            ...row,
          },
        });
      });

      const enrichedGuestDocs = guestDocs.map((doc) => {
        const metadata = (doc.metadata || {}) as GuestMetadata;

        // ✅ Include event relationship in semantic text
        const semanticText = `
Guest ID: ${metadata.guest_api_id}
Bio: ${metadata.bio_short}
Timezone: ${metadata.timezone}
Attending Event: ${metadata.event_name}
Event ID: ${metadata.event_api_id}
Number of Tickets: ${metadata.num_tickets_registered}
Section: ${metadata.section_label}
Social Media:
Avatar: ${metadata.avatar_url}
Last Online: ${metadata.last_online_at}
      `.trim();

        return new Document({
          pageContent: semanticText,
          metadata: {
            // ✅ Keep ALL original metadata for filtering
            doc_type: 'guest',
            event_api_id: metadata.event_api_id, // ⭐ CRITICAL for filtering
            event_name: metadata.event_name,
            guest_api_id: metadata.guest_api_id,
            timezone: metadata.timezone,
            bio_short: metadata.bio_short,
            avatar_url: metadata.avatar_url,
            last_online_at: metadata.last_online_at,
            num_tickets_registered:
              parseInt(metadata.num_tickets_registered) || 1,
            section_label: metadata.section_label,
          },
        });
      });

      allDocs.push(...enrichedGuestDocs);
      this.logger.log(`Loaded ${guestDocs.length} guest documents`);

      // Split into chunks
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });
      const chunks = await splitter.splitDocuments(allDocs);
      this.logger.log(`Split into ${chunks.length} chunks`);

      // Get Pinecone index
      const indexName = this.configService.get<string>(
        'app.pinecone.indexName',
      );
      const index = this.pineconeClient.Index(indexName as string);

      // Create vector store (batched upsert)
      if (!this.vectorStore) {
        this.vectorStore = await PineconeStore.fromExistingIndex(
          this.embeddings,
          { pineconeIndex: index },
        );
      }

      const batchSize = 500;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        this.logger.log(
          `Upserting batch ${i} – ${i + batch.length} of ${chunks.length}`,
        );
        await this.vectorStore.addDocuments(batch);
      }

      this.logger.log('Dual CSV ingestion completed successfully');
      return {
        processedDocs: allDocs.length,
        chunks: chunks.length,
        success: true,
        message: `Ingested ${eventDocs.length} events and ${guestDocs.length} guests`,
      };
    } catch (error) {
      this.logger.error(
        `Error ingesting CSVs: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  async query(
    conversationId: string,
    question: string,
    filter?: Record<string, any>,
  ): Promise<QueryResult> {
    try {
      await this.initialize();

      if (!this.vectorStore) {
        throw new Error(
          'Vector store not initialized. Please ingest data first.',
        );
      }

      this.logger.log(`Processing query for conversation: ${conversationId}`);

      if (!this.conversations.has(conversationId)) {
        // Create a prompt for rephrasing questions based on chat history
        const historyAwarePrompt = ChatPromptTemplate.fromMessages([
          new MessagesPlaceholder('chat_history'),
          ['user', '{input}'],
          [
            'user',
            'Given the above conversation, generate a search query to look up relevant information.',
          ],
        ]);

        // Base semantic retriever from Pinecone
        // Base semantic retriever from Pinecone
        const baseRetriever = this.vectorStore.asRetriever({
          k: 50,
          searchType: 'mmr',
          searchKwargs: {
            fetchK: 100,
            lambda: 0.5,
          },
          filter,
        });

        // Combined retriever: lexical (CSV bios) + vector, as a proper Runnable
        const combinedRetriever = RunnableLambda.from(async (q: string) => {
          const [vectorDocs, lexicalDocs] = await Promise.all([
            baseRetriever.getRelevantDocuments(q),
            this.lexicalSearchDocs(q, filter),
          ]);

          const MAX_LEXICAL_FOR_LLM = 30; // should match lexicalSearchDocs
          const MAX_VECTOR_FOR_LLM = 50; // tune depending on how heavy you want

          const trimmedLexical = lexicalDocs.slice(0, MAX_LEXICAL_FOR_LLM);
          const trimmedVector = vectorDocs.slice(0, MAX_VECTOR_FOR_LLM);

          // lexical first, then semantic
          return [...trimmedLexical, ...trimmedVector];
        });

        // Create history-aware retriever
        const historyAwareRetriever = await createHistoryAwareRetriever({
          llm: this.llm,
          retriever: combinedRetriever,
          rephrasePrompt: historyAwarePrompt,
        });

        // Create the main QA prompt with system instructions
        const qaPrompt = ChatPromptTemplate.fromMessages([
          // existing/primary system message (kept intentionally brief)
          ['system', ``],
          // second system-level instruction: data-savvy event assistant
          [
            'system',
            `You are EventBot, an assistant for event and guest management.

Use the provided context to answer questions about:
- Events: name, location, start and end dates, guest counts, founder counts.
- Guests: roles, their respective bios which events they are attending
- Founders: who they are, which events they attend
- Education or workplaces: search the bio of each guest/attendee for company or college. If not mentioned, return "Unknown"
- Socials: extract Instagram(Instagram:), Twitter, YouTube, TikTok handles exactly as in context. If none, return "Unknown"
- If asked which events are allumini (guest name) of this college( college can be IIT, MIT, Havard etc please use keyword they provided) use the "college_univerity_allumi_of:" in the guest list to find the answer. if the keyword is not found there search in the "Bio:" of the guest list.
 to find this particular person and then list out the event in which they appear in guest list. If only one of them is given, then say "Please provide more information".
 - To answer question related to number of guest coming for the event use the total guest metadata in the REGISTRATION & ATTENDANCE.
 -To answer question related to number of founder coming for the event use the Total Founders metadata in the REGISTRATION & ATTENDANCE.
- When returning info about guests do not send guest_id just send info about guests based on their bio
When checking for educational institutions or workplaces:
- Look for variations or abbreviations (e.g., "IIT", "Indian Institute of Technology", "IITD", "IIT Delhi", "Harvard", "Harvard University").
- Use context clues from the guest bio to detect likely institutions, but do not assume.
- If you find no clear match, respond with "I don't have enough information for that."
- When asked about a particular guests name, say "We cannot share personal details about individuals."

Rules:
1. Answer only from the provided context. Do NOT make assumptions or guesses.
2. For counts, numbers, or dates, use the exact values from the context.
3. For missing or empty fields, ALWAYS respond with "Unknown" or "I don't have enough information for that."
4. Keep answers concise, clear, and natural.
5. When multiple events or guests exist, clearly specify which event or guest your answer refers to.
6. For complex questions (e.g., who attended multiple events, cross-check founders), only provide information if it can be directly inferred from context; otherwise return "I don't have enough information for that."
7. When asked for lists (e.g., "all events", "all founders"), include EVERY matching result from the context provided and count the total number clearly.


Example:
- Question: Who works at StationX.network?
- Answer: Rish works at StationX.network
-Question: Which events have allumini from IIT mumbai?


Context: {context}
`,
          ],
          new MessagesPlaceholder('chat_history'),
          ['user', '{input}'],
        ]);

        // Create the document combination chain
        const documentChain = await createStuffDocumentsChain({
          llm: this.llm,
          prompt: qaPrompt,
        });

        // Create the final retrieval chain
        const retrievalChain = await createRetrievalChain({
          combineDocsChain: documentChain,
          retriever: historyAwareRetriever,
        });

        // Store chain and empty chat history
        this.conversations.set(conversationId, {
          chain: retrievalChain,
          chatHistory: [],
        });

        this.logger.log(`Created new conversation: ${conversationId}`);
      }

      const { chain, chatHistory } = this.conversations.get(conversationId)!;

      // Invoke the chain
      const response = await chain.invoke({
        input: question,
        chat_history: chatHistory,
      });

      // Update chat history
      chatHistory.push(new HumanMessage(question));
      chatHistory.push(new AIMessage(response.answer));

      this.logger.log(`Query processed successfully for: ${conversationId}`);

      if (!response || typeof response.answer !== 'string') {
        throw new Error('Invalid response from chain');
      }

      return {
        answer: response.answer,
        // sources: (response.context || []).map((doc: any) => ({
        //   content: doc.pageContent || '',
        //   metadata: doc.metadata || {},
        // })),
      } as any;
    } catch (error) {
      this.logger.error(
        `Error processing query: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }
  // Clear conversation history
  clearConversation(conversationId: string) {
    this.conversations.delete(conversationId);
  }
}
