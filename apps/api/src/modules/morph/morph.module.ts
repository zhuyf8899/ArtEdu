import { BadRequestException, Body, ConflictException, Controller, Get, Module, Param, Put, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from '../database/database.service';
import { parseInput } from '../../common/validation';
import { morphKeySchema, morphWriteSchema, parseMorphValue } from './morph.contracts';

@Controller('me/morph-state')
export class MorphController {
  constructor(private readonly auth: AuthService, private readonly database: DatabaseService) {}
  @Get()
  async read(@Req() request: FastifyRequest) {
    const actor = await this.auth.getActor(request);
    const result = await this.database.query('SELECT state_key,value_json,version FROM morph_workspace_state WHERE user_id=$1', [actor.id]);
    return { states: Object.fromEntries(result.rows.map(row => [row.state_key, { value: row.value_json, version: row.version }])) };
  }
  @Put(':key')
  async save(@Req() request: FastifyRequest, @Param('key') rawKey: string, @Body() body: unknown) {
    const actor = await this.auth.getActor(request);
    const key = parseInput(morphKeySchema, rawKey);
    const input = parseInput(morphWriteSchema, body);
    let value: unknown;
    try { value = parseMorphValue(key, input.value); } catch { throw new BadRequestException('保存内容格式错误或超过大小限制'); }
    // Version zero may create, but may never overwrite a row created in another tab.
    const result = input.version === 0
      ? await this.database.query(`INSERT INTO morph_workspace_state(user_id,state_key,value_json) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING RETURNING version`, [actor.id, key, JSON.stringify(value)])
      : await this.database.query(`UPDATE morph_workspace_state SET value_json=$3::jsonb,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND state_key=$2 AND version=$4 RETURNING version`, [actor.id, key, JSON.stringify(value), input.version]);
    if (!result.rowCount) throw new ConflictException('其他页面已修改此内容，请刷新后重试；当前输入仍保留');
    return { value, version: result.rows[0].version };
  }
}
@Module({ imports: [AuthModule], controllers: [MorphController] })
export class MorphModule {}
