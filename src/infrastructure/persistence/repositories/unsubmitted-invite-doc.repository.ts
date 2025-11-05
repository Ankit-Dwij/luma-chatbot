import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  UnsubmittedInviteDocument,
  UnsubmittedInvites,
} from '../schemas/unsubmittedInvites.schema';
import { UnsubmittedInvitesRepository } from './abstract/unsubmitted-invite.repository';
import { FindManyOptions, PaginatedResult } from 'src/utils/pagination';
import { UnsubmittedInviteMapper } from '../mappers/unsubmitted-invite.mapper';
import { UnsubmittedInviteEntity } from 'src/domain/entities/unsubmitted-invite.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UnsubmittedInvitesDocumentRepository
  implements UnsubmittedInvitesRepository
{
  constructor(
    @InjectModel(UnsubmittedInvites.name)
    private readonly unsubmittedInviteModel: Model<UnsubmittedInviteDocument>,
  ) {}

  async upsertById(
    data: Partial<UnsubmittedInviteEntity>,
  ): Promise<UnsubmittedInviteEntity> {
    const id = data?.id || uuidv4();

    const updated = await this.unsubmittedInviteModel
      .findOneAndUpdate(
        { id },
        { $set: { ...data, id } },
        { upsert: true, new: true },
      )
      .exec();

    return UnsubmittedInviteMapper.toDomain(updated);
  }

  async findMany(
    options: FindManyOptions,
  ): Promise<PaginatedResult<UnsubmittedInviteEntity>> {
    const { page, limit, filter = {}, sort = { createdAt: -1 } } = options;
    const skip = (page - 1) * limit;

    const [docs, total] = await Promise.all([
      this.unsubmittedInviteModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      this.unsubmittedInviteModel.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: docs.map((doc) => UnsubmittedInviteMapper.toDomain(doc)),
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }
}
