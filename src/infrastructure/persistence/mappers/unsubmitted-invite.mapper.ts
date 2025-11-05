import { UnsubmittedInviteEntity } from 'src/domain/entities/unsubmitted-invite.entity';
import { UnsubmittedInvites } from '../schemas/unsubmittedInvites.schema';

export class UnsubmittedInviteMapper {
  static toDomain(doc: UnsubmittedInvites): UnsubmittedInviteEntity {
    return {
      id: doc.id.toString(),
      xid: doc.xid,
      email: doc.email,
      secret: doc.secret,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  static toPersistence(
    entity: Partial<UnsubmittedInviteEntity>,
  ): Partial<UnsubmittedInvites> {
    return {
      xid: entity.xid,
      email: entity.email,
      secret: entity.secret,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
