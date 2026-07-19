import { Injectable, UnauthorizedException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'node:crypto';
import { WaUser, WaUserRole } from '@database/entities/wa-automation/wa-user.entity';

const SALT_LENGTH = 16;
const HASH_ITERATIONS = 100000;
const HASH_KEYLEN = 64;
const HASH_DIGEST = 'sha512';

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST)
    .toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  const verify = crypto
    .pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEYLEN, HASH_DIGEST)
    .toString('hex');
  return verify === hash;
}

@Injectable()
export class WaAuthService implements OnModuleInit {
  constructor(
    @InjectRepository(WaUser, 'data')
    private readonly userRepo: Repository<WaUser>,
    private readonly jwtService: JwtService,
  ) {}

  async onModuleInit(): Promise<void> {
    const count = await this.userRepo.count();
    if (count === 0) {
      const user = this.userRepo.create({
        username: 'admin',
        passwordHash: hashPassword('admin'),
        role: WaUserRole.ADMIN,
      });
      await this.userRepo.save(user);
      console.log('[WaAuth] Default admin user created (admin/admin)');
    }
  }

  async login(username: string, password: string): Promise<{ token: string; user: { id: number; username: string; role: string } }> {
    const user = await this.userRepo.findOne({ where: { username } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, username: user.username, role: user.role };
    const token = await this.jwtService.signAsync(payload);

    return { token, user: { id: user.id, username: user.username, role: user.role } };
  }

  async validateUser(userId: number): Promise<WaUser | null> {
    return this.userRepo.findOne({ where: { id: userId } });
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    user.passwordHash = hashPassword(newPassword);
    await this.userRepo.save(user);
  }
}
