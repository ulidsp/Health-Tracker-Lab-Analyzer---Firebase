/**
 * Environment Detection Utility for Dual-Layer Gemini Engine
 * 
 * Determines whether to invoke server-side proxy (/api/ai/...) or direct client SDK calls
 * based on current runtime environment (AI Studio Preview sandbox vs Vercel / External domain).
 */

export function isAiStudioEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  
  const hostname = window.location.hostname.toLowerCase();
  
  // AI Studio Preview, Cloud Run preview domains, or Google internal domains
  return (
    hostname.includes('aistudio.google.com') ||
    hostname.includes('run.app') ||
    hostname.includes('ais-dev-') ||
    hostname.includes('ais-pre-') ||
    hostname.includes('googleusercontent.com')
  );
}

export function shouldUseDirectClientCalls(): boolean {
  if (typeof window === 'undefined') return false;

  // Explicit user or environment override via Vite env
  const viteForceDirect = import.meta.env.VITE_FORCE_DIRECT_CLIENT;
  if (viteForceDirect === 'true') return true;
  if (viteForceDirect === 'false') return false;

  const hostname = window.location.hostname.toLowerCase();

  // If deployed on Vercel or an external standalone production server
  if (hostname.includes('vercel.app')) {
    return true;
  }

  // If in AI Studio Preview or Google Cloud Run sandbox:
  // Must use Server Proxy to avoid iframe sandbox restrictions, CORS, and header limits
  if (isAiStudioEnvironment()) {
    return false;
  }

  // Local development with server.ts running on port 3000
  // When running via `tsx server.ts`, server proxy is available and preferred
  return false;
}

export function getAiProxyEndpoint(path: string = '/api/ai/generate'): string {
  return path;
}
