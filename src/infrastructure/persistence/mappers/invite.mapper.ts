import { InviteEntity } from 'src/domain/entities/invite.entity';
import { Invite } from '../schemas/invite.schema';

export class InviteMapper {
  static toDomain(doc: Invite): InviteEntity {
    return {
      id: doc.id.toString(),
      xid: doc.xid,
      seatNumber: doc.seatNumber,
      email: doc.email,
      secret: doc.secret,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  static toPersistence(entity: Partial<InviteEntity>): Partial<Invite> {
    return {
      xid: entity.xid,
      seatNumber: entity.seatNumber,
      email: entity.email,
      secret: entity.secret,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
