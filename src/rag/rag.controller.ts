import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import {
  FileInterceptor,
  FileFieldsInterceptor,
} from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import type { Request } from 'express';
import { v4 as uuidv4 } from 'uuid';

import type {
  FileNameCallback,
  UploadedFileType,
  FileFields,
} from './types/file-upload.types';
import { generateFilename, csvFileFilter } from './types/file-upload.types';
import { RAGServiceWithLangChain } from './rag.service';
import { IngestCSVDto } from './dto/ingest-csv.dto';
import { ChatResponseDto } from './dto/chat-response.dto';
import { ChatQueryDto } from './dto/chat-query.dto';

@ApiTags('RAG')
@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RAGServiceWithLangChain) {}

  @Post('ingest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ingest CSV file into vector database' })
  @ApiResponse({
    status: 200,
    description: 'CSV file ingested successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid file path or CSV format',
  })
  async ingestCSV(@Body() ingestDto: IngestCSVDto) {
    return await this.ragService.ingestCSV(ingestDto.filePath);
  }

  @Post('ingest/both/upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'events', maxCount: 1 },
        { name: 'guests', maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: './uploads',
          filename: (
            req: Request,
            file: UploadedFileType,
            cb: FileNameCallback,
          ) => {
            const prefix = file.fieldname === 'events' ? 'events-' : 'guests-';
            generateFilename(req, file, cb, prefix);
          },
        }) as any,
        fileFilter: csvFileFilter,
      },
    ),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload and ingest both events and guests CSV files',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        events: {
          type: 'string',
          format: 'binary',
          description: 'Events CSV file',
        },
        guests: {
          type: 'string',
          format: 'binary',
          description: 'Guests CSV file',
        },
      },
      required: ['events', 'guests'],
    },
  })
  async uploadAndIngestBoth(@UploadedFiles() files: FileFields) {
    if (!files?.events?.[0]?.path) {
      throw new BadRequestException('Events file is required');
    }
    if (!files?.guests?.[0]?.path) {
      throw new BadRequestException('Guests file is required');
    }

    return await this.ragService.ingestBothCSVs(
      files.events[0].path,
      files.guests[0].path,
    );
  }

  @Post('ingest/both')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ingest both events and guests CSV files from paths',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        eventsPath: {
          type: 'string',
          description: 'Path to events CSV file',
        },
        guestsPath: {
          type: 'string',
          description: 'Path to guests CSV file',
        },
      },
      required: ['eventsPath', 'guestsPath'],
    },
  })
  async ingestBothCSVs(
    @Body() body: { eventsPath: string; guestsPath: string },
  ) {
    return await this.ragService.ingestBothCSVs(
      body.eventsPath,
      body.guestsPath,
    );
  }

  @Post('ingest/upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (
          req: Request,
          file: UploadedFileType,
          cb: FileNameCallback,
        ) => {
          generateFilename(req, file, cb);
        },
      }) as any,
      fileFilter: csvFileFilter,
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload and ingest CSV file' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadAndIngest(@UploadedFile() file: UploadedFileType) {
    if (!file?.path) {
      throw new BadRequestException('No file uploaded or invalid file');
    }

    return await this.ragService.ingestCSV(file.path);
  }

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Query the RAG system' })
  @ApiResponse({
    status: 200,
    description: 'Query processed successfully',
    type: ChatResponseDto,
  })
  async chat(@Body() chatQuery: ChatQueryDto): Promise<ChatResponseDto> {
    const conversationId = chatQuery.conversationId || uuidv4();

    const result = await this.ragService.query(
      conversationId,
      chatQuery.question,
      chatQuery.filter,
    );

    return {
      ...result,
      conversationId,
    };
  }

  //   @Delete('conversations/:id')
  //   @HttpCode(HttpStatus.NO_CONTENT)
  //   @ApiOperation({ summary: 'Clear conversation history' })
  //   @ApiResponse({
  //     status: 204,
  //     description: 'Conversation cleared successfully',
  //   })
  //   clearConversation(@Param('id') conversationId: string) {
  //     this.ragService.clearConversation(conversationId);
  //   }

  //   @Get('conversations')
  //   @ApiOperation({ summary: 'Get all active conversation IDs' })
  //   getConversations() {
  //     return {
  //       conversations: this.ragService.getActiveConversations(),
  //       count: this.ragService.getConversationCount(),
  //     };
  //   }

  //   @Get('health')
  //   @ApiOperation({ summary: 'Health check endpoint' })
  //   async healthCheck() {
  //     return await this.ragService.healthCheck();
  //   }
}
