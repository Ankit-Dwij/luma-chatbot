import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InviteRepository } from './abstract/invite.repository';
import { Invite, InviteDocument } from '../schemas/invite.schema';
import { InviteMapper } from '../mappers/invite.mapper';
import { InviteEntity } from 'src/domain/entities/invite.entity';
import { FindManyOptions, PaginatedResult } from 'src/utils/pagination';

@Injectable()
export class InviteDocumentRepository implements InviteRepository {
  constructor(
    @InjectModel(Invite.name)
    private readonly inviteModel: Model<InviteDocument>,
  ) {}

  async findMany(
    options: FindManyOptions,
  ): Promise<PaginatedResult<InviteEntity>> {
    const { page, limit, filter = {}, sort = { createdAt: -1 } } = options;
    const skip = (page - 1) * limit;

    const [docs, total] = await Promise.all([
      this.inviteModel.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      this.inviteModel.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: docs.map((doc) => InviteMapper.toDomain(doc)),
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async findById(id: string): Promise<InviteEntity | null> {
    const doc = await this.inviteModel.findById(id).lean();
    return doc ? InviteMapper.toDomain(doc) : null;
  }

  async findByXid(xid: string): Promise<InviteEntity | null> {
    const doc = await this.inviteModel.findOne({ xid }).lean();
    return doc ? InviteMapper.toDomain(doc) : null;
  }

  async create(invite: Partial<InviteEntity>): Promise<InviteEntity> {
    const created = await this.inviteModel.create(
      InviteMapper.toPersistence(invite),
    );
    return InviteMapper.toDomain(created.toObject());
  }

  async update(
    id: string,
    invite: Partial<InviteEntity>,
  ): Promise<InviteEntity> {
    const updated = await this.inviteModel
      .findByIdAndUpdate(id, InviteMapper.toPersistence(invite), { new: true })
      .lean();
    if (!updated) throw new Error('Invite not found');
    return InviteMapper.toDomain(updated);
  }

  async delete(id: string): Promise<void> {
    await this.inviteModel.findByIdAndDelete(id);
  }

  async findMaxSeatNumber(): Promise<number | null> {
    const result = await this.inviteModel
      .findOne({}, { seatNumber: 1 })
      .sort({ seatNumber: -1 })
      .lean();

    return result ? result.seatNumber : null;
  }
}
