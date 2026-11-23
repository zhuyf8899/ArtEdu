import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseService } from '../database/database.service';

export const workspaceGrantPath = '/api/agent-runs/workspace-preview-grant/';

function digest(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class WorkspacePreviewGrants {
  constructor(private readonly db: DatabaseService) {}

  async issue(userId: string, file: string) {
    const directory = file.slice(0, Math.max(0, file.lastIndexOf('/')));
    const token = randomBytes(32).toString('base64url');
    await this.db.query('DELETE FROM workspace_preview_grants WHERE expires_at<=CURRENT_TIMESTAMP');
    await this.db.query('INSERT INTO workspace_preview_grants(token_hash,user_id,directory) VALUES($1,$2,$3)', [digest(token), userId, directory]);
    return workspaceGrantPath + token + '/' + file.split('/').map(encodeURIComponent).join('/');
  }

  async authorize(token: string, file: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new NotFoundException('预览链接无效或过期');
    const { rows: [grant] } = await this.db.query<{user_id: string; directory: string}>(`
      SELECT preview.user_id,preview.directory FROM workspace_preview_grants preview
      JOIN users owner ON owner.id=preview.user_id
      WHERE preview.token_hash=$1 AND preview.expires_at>CURRENT_TIMESTAMP AND owner.status='active'
    `, [digest(token)]);
    if (!grant) throw new NotFoundException('预览链接无效或过期');
    if (file.split('/').some(segment => !segment || segment === '.' || segment === '..' || /[\\:\u0000-\u001f]/.test(segment))
      || (grant.directory ? !file.startsWith(grant.directory + '/') : file.startsWith('__conversations/'))) {
      throw new ForbiddenException('文件不属于此次预览');
    }
    return {id: grant.user_id, directory: grant.directory};
  }
}
