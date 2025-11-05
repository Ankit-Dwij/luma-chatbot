import { InviteEntity } from 'src/domain/entities/invite.entity';
import { FindManyOptions, PaginatedResult } from 'src/utils/pagination';

export abstract class InviteRepository {
  abstract findMany(
    options: FindManyOptions,
  ): Promise<PaginatedResult<InviteEntity>>;
  abstract findById(id: string): Promise<InviteEntity | null>;
  abstract findByXid(xid: string): Promise<InviteEntity | null>;
  abstract create(invite: Partial<InviteEntity>): Promise<InviteEntity>;
  abstract update(
    id: string,
    invite: Partial<InviteEntity>,
  ): Promise<InviteEntity>;
  abstract delete(id: string): Promise<void>;
  abstract findMaxSeatNumber(): Promise<number | null>;
}
