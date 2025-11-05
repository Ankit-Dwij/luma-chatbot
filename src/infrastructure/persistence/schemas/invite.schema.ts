import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

@Schema({ timestamps: true, collection: 'invites' })
export class Invite {
  @Prop({ required: true, default: () => uuidv4(), unique: true })
  id: string;

  @Prop({ required: true, unique: true })
  xid: string;

  @Prop({ required: true, unique: true })
  seatNumber: number;

  @Prop({ required: true })
  email: string;

  @Prop({ required: false })
  secret: string;

  @Prop({ required: true, default: Date.now })
  createdAt: Date;

  @Prop({ required: true, default: Date.now })
  updatedAt: Date;
}

export type InviteDocument = Invite & Document;
export const InviteSchema = SchemaFactory.createForClass(Invite);
