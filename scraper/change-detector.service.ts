import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

@Injectable()
export class ChangeDetectorService {
  hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  hasChanged(existingHash: string | null, newContent: string): boolean {
    const newHash = this.hashContent(newContent);
    return existingHash !== newHash;
  }
}
