import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { BufferMemory } from 'langchain/memory';
import { ConversationalRetrievalQAChain } from 'langchain/chains';
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
Guest Name: ${metadata.guest_name}
Guest ID: ${metadata.guest_api_id}
Username: ${metadata.username}
Bio: ${metadata.bio_short}
Website: ${metadata.website}
Timezone: ${metadata.timezone}
Attending Event: ${metadata.event_name}
Event ID: ${metadata.event_api_id}
Number of Tickets: ${metadata.num_tickets_registered}
Section: ${metadata.section_label}
Social Media:
  - Twitter: @${metadata.twitter_handle}
  - LinkedIn: ${metadata.linkedin_handle}
  - Instagram: @${metadata.instagram_handle}
  - YouTube: ${metadata.youtube_handle}
  - TikTok: @${metadata.tiktok_handle}
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
            guest_name: metadata.guest_name,
            username: metadata.username,
            website: metadata.website,
            timezone: metadata.timezone,
            bio_short: metadata.bio_short,
            avatar_url: metadata.avatar_url,
            twitter_handle: metadata.twitter_handle,
            linkedin_handle: metadata.linkedin_handle,
            instagram_handle: metadata.instagram_handle,
            youtube_handle: metadata.youtube_handle,
            tiktok_handle: metadata.tiktok_handle,
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

      // Get Pinecone index (ensure it's initialized / consistent)
      const indexName = this.configService.get<string>(
        'app.pinecone.indexName',
      );
      const index = this.pineconeClient.Index(indexName as string);

      // Ensure vector store is initialized for this index
      if (!this.vectorStore) {
        this.vectorStore = await PineconeStore.fromExistingIndex(
          this.embeddings,
          { pineconeIndex: index },
        );
      }

      // 🚀 Batched upsert into Pinecone
      const batchSize = 500; // you can tune this (e.g. 200, 500, 1000)
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

        // Create history-aware retriever
        const historyAwareRetriever = await createHistoryAwareRetriever({
          llm: this.llm,
          retriever: this.vectorStore.asRetriever({
            k: 100,
            searchType: 'mmr',
            searchKwargs: {
              fetchK: 200,
              lambda: 0.5,
            },
            filter,
          }),
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
- Guests: names, roles, their respective bios which events they are attending
- Founders: who they are, which events they attend
- Education or workplaces: search the bio of each guest/attendee for company or college. If not mentioned, return "Unknown"
- Socials: extract Instagram(Instagram:), Twitter, YouTube, TikTok handles exactly as in context. If none, return "Unknown"
- If asked which events are allumini (guest name) of this college( college can be IIT, MIT, Havard etc please use keyword they provided) use the "college_univerity_allumi_of:" in the guest list to find the answer. if the keyword is not found there search in the "Bio:" of the guest list.
-If the user asks can you tell me which events this guest (they will give a name eg Prateek) from this organisation ( can use term like works, founder , from) is going. Use the name of the guest and Company_or_organisation_they_work_for
 to find this particular person and then list out the event in which they appear in guest list. If only one of them is given, then say "Please provide more information".
 - To answer question related to number of guest coming for the event use the total guest metadata in the REGISTRATION & ATTENDANCE.
 -To answer question related to number of founder coming for the event use the Total Founders metadata in the REGISTRATION & ATTENDANCE.

When checking for educational institutions or workplaces:
- Look for variations or abbreviations (e.g., "IIT", "Indian Institute of Technology", "IITD", "IIT Delhi", "Harvard", "Harvard University").
- Use context clues from the guest bio to detect likely institutions, but do not assume.
- If you find no clear match, respond with "I don't have enough information for that."
 

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
- Question: What is the Instagram handle of Aeron B?
- Answer: arankk
-Question: Prateek from blocmates is going to which events?
-Answer: He is going to **Build Buddies Hanoi**, **LabWeek Web3 Opening Party:** .
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
