import { UnsubmittedInviteEntity } from 'src/domain/entities/unsubmitted-invite.entity';
import { FindManyOptions, PaginatedResult } from 'src/utils/pagination';

export abstract class UnsubmittedInvitesRepository {
  abstract upsertById(
    data: Partial<UnsubmittedInviteEntity>,
  ): Promise<UnsubmittedInviteEntity>;

  abstract findMany(
    options: FindManyOptions,
  ): Promise<PaginatedResult<UnsubmittedInviteEntity>>;
}
