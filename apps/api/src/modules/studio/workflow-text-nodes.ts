import { BadRequestException } from '@nestjs/common';

export const additionalPlatformNodeTypes = ['text_constant', 'text_join', 'text_replace', 'text_template', 'text_to_prompt', 'text_to_negative', 'text_preview', 'reroute', 'result_select', 'condition', 'loop'] as const;
export const textProcessingTypes = ['text_replace', 'text_template', 'text_to_prompt', 'text_to_negative', 'text_preview'];

export function assertTextNodeParameters(node: Record<string, any>) {
  const data = node.data ?? {};
  if (node.type === 'text_replace' && (typeof data.find !== 'string' || !data.find)) throw new BadRequestException('查找替换节点需要填写非空的查找文字');
  if (node.type === 'text_template') {
    if (!String(data.value ?? '').trim()) throw new BadRequestException('提示词模板不能为空');
    if (/\{([^{}]+)\}/g.test(String(data.value).replace(/\{(?:text|prompt|negative)\}/g, ''))) throw new BadRequestException('模板仅支持 {text}、{prompt}、{negative} 占位符');
  }
}
