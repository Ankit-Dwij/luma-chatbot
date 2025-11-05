import { ApiProperty } from '@nestjs/swagger';

export class SourceDocument {
  @ApiProperty()
  content: string;

  @ApiProperty()
  metadata: Record<string, any>;
}

export class ChatResponseDto {
  @ApiProperty({
    description: 'The generated answer',
  })
  answer: string;

  @ApiProperty({
    description: 'Source documents used to generate the answer',
    type: [SourceDocument],
  })
  sources: SourceDocument[];

  @ApiProperty({
    description: 'Conversation ID',
  })
  conversationId?: string;
}
