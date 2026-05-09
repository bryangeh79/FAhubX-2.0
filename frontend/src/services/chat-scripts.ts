import api from './api';

export interface ScriptPhase {
  label: string;
  sender?: 'A' | 'B';
  messages: string[];
}

export interface ChatScript {
  id: string;
  userId: string;
  scriptNumber: number;
  title: string;
  goal?: string;
  systemPrompt?: string;
  phases: ScriptPhase[];
  category: string;
  language: string;
  createdAt: string;
  updatedAt: string;
}

export interface LanguageStats {
  zh: number;
  en: number;
  vi: number;
}

export interface ImportScriptPackPayload {
  name: string;
  language: 'en' | 'vi' | 'zh';
  version?: string;
  scripts: Array<{
    scriptNumber: number;
    title: string;
    goal?: string;
    systemPrompt?: string;
    category?: string;
    phases: ScriptPhase[];
  }>;
  conflictMode?: 'overwrite' | 'skip';
}

export interface ImportResult {
  imported: number;
  skipped: number;
  overwritten: number;
  total: number;
}

export const chatScriptsService = {
  async listByLanguage(language: 'zh' | 'en' | 'vi' = 'zh'): Promise<ChatScript[]> {
    const res = await api.get<{ data: ChatScript[] } | ChatScript[]>(`/chat-scripts`, {
      params: { language },
    });
    const raw: any = res.data;
    // Interceptor may wrap in { data: ... }, or return array directly
    return Array.isArray(raw) ? raw : raw?.data || [];
  },

  async getLanguageStats(): Promise<LanguageStats> {
    const res = await api.get<{ data: LanguageStats } | LanguageStats>('/chat-scripts/language-stats');
    const raw: any = res.data;
    return raw?.data ?? raw;
  },

  async importPack(payload: ImportScriptPackPayload): Promise<ImportResult> {
    const res = await api.post<{ data: ImportResult } | ImportResult>('/chat-scripts/import-pack', payload);
    const raw: any = res.data;
    return raw?.data ?? raw;
  },

  async deleteByLanguage(language: 'en' | 'vi'): Promise<{ deleted: number }> {
    const res = await api.delete<{ data: { deleted: number } } | { deleted: number }>(`/chat-scripts/by-language/${language}`);
    const raw: any = res.data;
    return raw?.data ?? raw;
  },

  async updateScript(id: string, data: Partial<ChatScript>): Promise<ChatScript> {
    const res = await api.put<{ data: ChatScript } | ChatScript>(`/chat-scripts/${id}`, data);
    const raw: any = res.data;
    return raw?.data ?? raw;
  },

  async resetToDefault(): Promise<{ count: number }> {
    const res = await api.post<{ data: { count: number } } | { count: number }>('/chat-scripts/reset-all');
    const raw: any = res.data;
    return raw?.data ?? raw;
  },
};
