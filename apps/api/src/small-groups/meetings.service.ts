import { Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceRecord, GroupMeeting } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { RecordAttendanceDto } from './dto/record-attendance.dto';

type CreateMeetingResult = {
  meeting: GroupMeeting;
  attendance_count: number;
};

@Injectable()
export class MeetingsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateMeetingDto,
    user: JwtPayload,
  ): Promise<CreateMeetingResult> {
    const group = await this.prisma.client.smallGroup.findUnique({
      where: { id: dto.small_group_id },
      select: { id: true },
    });
    if (!group) throw new NotFoundException('Grupo não encontrado');

    return this.prisma.runInTx(
      async (tx) => {
        const meeting = await tx.groupMeeting.create({
          data: {
            tenant_id: user.tenant_id,
            congregation_id: user.congregation_id,
            small_group_id: dto.small_group_id,
            occurred_at: new Date(dto.occurred_at),
            topic: dto.topic,
            observations: dto.observations,
            offering_amount: dto.offering_amount,
          },
        });

        let attendance_count = 0;

        if (dto.attendee_ids && dto.attendee_ids.length > 0) {
          const result = await tx.attendanceRecord.createMany({
            data: dto.attendee_ids.map((person_id) => ({
              tenant_id: user.tenant_id,
              congregation_id: user.congregation_id,
              group_meeting_id: meeting.id,
              person_id,
            })),
            skipDuplicates: true,
          });
          attendance_count = result.count;
        }

        return { meeting, attendance_count };
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  }

  async findByGroup(groupId: string) {
    return this.prisma.client.groupMeeting.findMany({
      where: { small_group_id: groupId },
      orderBy: { occurred_at: 'desc' },
      include: {
        _count: { select: { attendanceRecords: true } },
      },
    });
  }

  async findOne(meetingId: string) {
    const meeting = await this.prisma.client.groupMeeting.findUnique({
      where: { id: meetingId },
      include: {
        attendanceRecords: {
          include: { person: true },
        },
      },
    });
    if (!meeting) throw new NotFoundException('Reunião não encontrada');
    return meeting;
  }

  async update(meetingId: string, dto: UpdateMeetingDto): Promise<GroupMeeting> {
    const existing = await this.prisma.client.groupMeeting.findUnique({
      where: { id: meetingId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Reunião não encontrada');

    return this.prisma.client.groupMeeting.update({
      where: { id: meetingId },
      data: {
        ...dto,
        occurred_at: dto.occurred_at ? new Date(dto.occurred_at) : undefined,
      },
    });
  }

  async recordAttendance(
    meetingId: string,
    dto: RecordAttendanceDto,
    user: JwtPayload,
  ): Promise<{ added: number }> {
    const meeting = await this.prisma.client.groupMeeting.findUnique({
      where: { id: meetingId },
      select: { id: true },
    });
    if (!meeting) throw new NotFoundException('Reunião não encontrada');

    const result = await this.prisma.client.attendanceRecord.createMany({
      data: dto.person_ids.map((person_id) => ({
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        group_meeting_id: meetingId,
        person_id,
      })),
      skipDuplicates: true,
    });

    return { added: result.count };
  }

  async removeAttendance(
    meetingId: string,
    personId: string,
  ): Promise<AttendanceRecord> {
    const record = await this.prisma.client.attendanceRecord.findUnique({
      where: {
        group_meeting_id_person_id: {
          group_meeting_id: meetingId,
          person_id: personId,
        },
      },
    });
    if (!record) throw new NotFoundException('Registro de presença não encontrado');
    return this.prisma.client.attendanceRecord.delete({ where: { id: record.id } });
  }
}
