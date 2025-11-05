import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Invite, InviteSchema } from './persistence/schemas/invite.schema';
import { InviteRepository } from './persistence/repositories/abstract/invite.repository';
import { InviteDocumentRepository } from './persistence/repositories/invite-doc.repository';
import {
  UnsubmittedInvites,
  UnsubmittedInviteSchema,
} from './persistence/schemas/unsubmittedInvites.schema';
import { UnsubmittedInvitesRepository } from './persistence/repositories/abstract/unsubmitted-invite.repository';
import { UnsubmittedInvitesDocumentRepository } from './persistence/repositories/unsubmitted-invite-doc.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Invite.name, schema: InviteSchema },
      { name: UnsubmittedInvites.name, schema: UnsubmittedInviteSchema },
    ]),
  ],
  providers: [
    { provide: InviteRepository, useClass: InviteDocumentRepository },
    {
      provide: UnsubmittedInvitesRepository,
      useClass: UnsubmittedInvitesDocumentRepository,
    },
  ],
  exports: [InviteRepository, UnsubmittedInvitesRepository],
})
export class InfrastructureModule {}
