import { Injectable, Logger } from '@nestjs/common';

/**
 * v1.2.0 Phase 4b — 统一 AI 客户端
 *
 * 支持 Claude / OpenAI / DeepSeek 三家。
 * 走纯 HTTP（fetch），不引入 SDK 依赖 —— 避免打包体积膨胀。
 *
 * 注意：
 * - 不存 key，key 每次调用时传入
 * - 10 秒超时 + 单次调用设计（不做流式）
 * - 调用失败不抛异常，返回 { success: false, error }
 */

export type AiProvider = 'claude' | 'openai' | 'deepseek';

export interface AiAnswerRequest {
  provider: AiProvider;
  apiKey: string;
  systemPrompt: string;    // 例如 "你是对{keyword}感兴趣的新手..."
  question: string;         // FB 管理员问的问题
  keyword?: string;         // 行业关键词（用于替换 prompt 里的 {keyword}）
  groupContext?: string;    // 群名称/描述，给 AI 更多 context
  maxTokens?: number;
}

export interface AiAnswerResponse {
  success: boolean;
  answer?: string;
  error?: string;
  model?: string;
}

const TIMEOUT_MS = 10_000;

@Injectable()
export class AiClientService {
  private readonly logger = new Logger(AiClientService.name);

  /**
   * 生成加群问题的回答
   */
  async generateAnswer(req: AiAnswerRequest): Promise<AiAnswerResponse> {
    // 把 prompt 里的 {keyword} 占位符替换
    const systemPrompt = req.keyword
      ? req.systemPrompt.replace(/\{keyword\}/g, req.keyword)
      : req.systemPrompt;

    const userMessage = req.groupContext
      ? `群信息：${req.groupContext}\n\n管理员问题：${req.question}\n\n请简短礼貌回答（1-2 句，50 字以内）。`
      : `管理员问题：${req.question}\n\n请简短礼貌回答（1-2 句，50 字以内）。`;

    try {
      if (req.provider === 'claude') {
        return await this.callClaude(req.apiKey, systemPrompt, userMessage, req.maxTokens ?? 150);
      }
      if (req.provider === 'openai') {
        return await this.callOpenAI(req.apiKey, systemPrompt, userMessage, req.maxTokens ?? 150);
      }
      if (req.provider === 'deepseek') {
        return await this.callDeepSeek(req.apiKey, systemPrompt, userMessage, req.maxTokens ?? 150);
      }
      return { success: false, error: `不支持的 AI 提供商: ${req.provider}` };
    } catch (err: any) {
      this.logger.warn(`AI 调用失败 (${req.provider}): ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Claude Haiku —— Anthropic Messages API
   * https://docs.anthropic.com/en/api/messages
   */
  private async callClaude(
    apiKey: string,
    systemPrompt: string,
    userMessage: string,
    maxTokens: number,
  ): Promise<AiAnswerResponse> {
    const model = 'claude-haiku-4-5';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
        signal: controller.signal,
      } as any);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { success: false, error: `Claude API ${res.status}: ${text.slice(0, 200)}`, model };
      }
      const data: any = await res.json();
      const answer = data?.content?.[0]?.text?.trim();
      if (!answer) return { success: false, error: 'Claude 未返回文本', model };
      return { success: true, answer, model };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * OpenAI GPT-4o-mini —— Chat Completions API
   * https://platform.openai.com/docs/api-reference/chat
   */
  private async callOpenAI(
    apiKey: string,
    systemPrompt: string,
    userMessage: string,
    maxTokens: number,
  ): Promise<AiAnswerResponse> {
    const model = 'gpt-4o-mini';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        }),
        signal: controller.signal,
      } as any);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { success: false, error: `OpenAI API ${res.status}: ${text.slice(0, 200)}`, model };
      }
      const data: any = await res.json();
      const answer = data?.choices?.[0]?.message?.content?.trim();
      if (!answer) return { success: false, error: 'OpenAI 未返回文本', model };
      return { success: true, answer, model };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * DeepSeek Chat —— OpenAI-compatible endpoint
   * https://api-docs.deepseek.com/
   */
  private async callDeepSeek(
    apiKey: string,
    systemPrompt: string,
    userMessage: string,
    maxTokens: number,
  ): Promise<AiAnswerResponse> {
    const model = 'deepseek-chat';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        }),
        signal: controller.signal,
      } as any);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { success: false, error: `DeepSeek API ${res.status}: ${text.slice(0, 200)}`, model };
      }
      const data: any = await res.json();
      const answer = data?.choices?.[0]?.message?.content?.trim();
      if (!answer) return { success: false, error: 'DeepSeek 未返回文本', model };
      return { success: true, answer, model };
    } finally {
      clearTimeout(timer);
    }
  }
}
