import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  //   Get,
  //   Param,
  //   Delete,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import type { Request } from 'express';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';

interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}
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

  @Post('ingest/upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (
          _req: Request,
          file: UploadedFile,
          cb: (error: Error | null, filename: string) => void,
        ) => {
          try {
            const randomName = uuidv4();
            const extension = extname(file.originalname);
            cb(null, `${randomName}${extension}`);
          } catch (error) {
            cb(error as Error, '');
          }
        },
      }) as any,
      fileFilter: (
        _req: Request,
        file: UploadedFile,
        cb: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        if (file.mimetype !== 'text/csv') {
          cb(new BadRequestException('Only CSV files are allowed'), false);
          return;
        }
        cb(null, true);
      },
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
  async uploadAndIngest(@UploadedFile() file: UploadedFile) {
    if (!file || !file.path) {
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
