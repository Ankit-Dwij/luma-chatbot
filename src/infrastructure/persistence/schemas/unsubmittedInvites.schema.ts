import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

@Schema({ timestamps: true, collection: 'unsubmitted_invites' })
export class UnsubmittedInvites {
  @Prop({ required: true, default: () => uuidv4(), unique: true })
  id: string;

  @Prop()
  xid: string;

  @Prop()
  email: string;

  @Prop()
  secret: string;

  @Prop({ required: true, default: Date.now })
  createdAt: Date;

  @Prop({ required: true, default: Date.now })
  updatedAt: Date;
}

export type UnsubmittedInviteDocument = UnsubmittedInvites & Document;
export const UnsubmittedInviteSchema =
  SchemaFactory.createForClass(UnsubmittedInvites);
