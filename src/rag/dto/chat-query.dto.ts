import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatQueryDto {
  @ApiProperty({
    description: 'The user question to answer',
    example: 'How many attendees are from Google?',
  })
  @IsString()
  @IsNotEmpty()
  question: string;

  @ApiPropertyOptional({
    description: 'Conversation ID for maintaining context',
    example: 'conv-123-456',
  })
  @IsString()
  @IsOptional()
  conversationId?: string;

  @ApiPropertyOptional({
    description: 'Metadata filters for vector search',
    example: { ticketType: 'VIP', company: 'Google' },
  })
  @IsObject()
  @IsOptional()
  filter?: Record<string, any>;
}
