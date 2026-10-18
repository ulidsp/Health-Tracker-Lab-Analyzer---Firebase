/**
 * AI Execution Tracker & Security Credential Storage
 * 
 * Provides:
 * 1. Live audit trail of all AI requests (requested model vs actual model used)
 * 2. Fallback tracking and latency monitoring
 * 3. Secure LocalStorage management for optional user custom Gemini API keys
 * 4. Reactive event subscriptions for UI indicators (pulse dots, status badges)
 */

export interface AILogEntry {
  id: string;
  timestamp: string;
  taskType: string;
  requestedModel: string;
  actualModel: string;
  fallbackOccurred: boolean;
  attemptedModels: string[];
  latencyMs: number;
  keySource: 'Server Env' | 'User Custom Key' | 'Vite Client Env';
  keyFailoverOccurred?: boolean;
  keyFailoverReason?: string;
  status: 'success' | 'fallback_success' | 'error';
  errorMessage?: string;
  promptPreview?: string;
}

const STORAGE_KEY_CUSTOM_API_KEY = 'health_tracker_gemini_api_key';
const STORAGE_KEY_LOGS = 'health_tracker_ai_logs';
const MAX_LOGS = 100;

type Listener = (logs: AILogEntry[]) => void;
const listeners = new Set<Listener>();

// In-memory cache initialized from sessionStorage if available
let logCache: AILogEntry[] = [];
if (typeof window !== 'undefined') {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY_LOGS);
    if (saved) {
      logCache = JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Failed to load saved AI logs:', e);
  }
}

function notifyListeners() {
  const cloned = [...logCache];
  listeners.forEach((listener) => {
    try {
      listener(cloned);
    } catch (e) {
      console.error('Error in AI tracker listener:', e);
    }
  });
}

/**
 * Record an AI execution entry
 */
export function recordAILog(entry: Omit<AILogEntry, 'id' | 'timestamp'>): AILogEntry {
  const fullEntry: AILogEntry = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    timestamp: new Date().toLocaleTimeString('th-TH', { hour12: false }),
    ...entry,
  };

  logCache.unshift(fullEntry);
  if (logCache.length > MAX_LOGS) {
    logCache = logCache.slice(0, MAX_LOGS);
  }

  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(logCache));
    } catch {
      // Ignore quota errors
    }
  }

  notifyListeners();
  return fullEntry;
}

export function getAILogs(): AILogEntry[] {
  return [...logCache];
}

export function clearAILogs(): void {
  logCache = [];
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(STORAGE_KEY_LOGS);
    } catch {
      // Ignore
    }
  }
  notifyListeners();
}

export function subscribeToAILogs(listener: Listener): () => void {
  listeners.add(listener);
  listener([...logCache]);
  return () => {
    listeners.delete(listener);
  };
}

export function getLastAILog(): AILogEntry | null {
  return logCache[0] || null;
}

// ==========================================
// Custom API Key Storage (LocalStorage)
// ==========================================

export function getCustomApiKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY_CUSTOM_API_KEY) || '';
}

export function setCustomApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  const clean = key.trim();
  if (clean) {
    localStorage.setItem(STORAGE_KEY_CUSTOM_API_KEY, clean);
  } else {
    localStorage.removeItem(STORAGE_KEY_CUSTOM_API_KEY);
  }
}

export function removeCustomApiKey(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY_CUSTOM_API_KEY);
}

export function hasCustomApiKey(): boolean {
  return Boolean(getCustomApiKey());
}
