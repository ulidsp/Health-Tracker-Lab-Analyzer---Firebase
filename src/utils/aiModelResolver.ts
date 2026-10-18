/**
 * AI Model Resolver & Smart Cascade Fallback
 * 
 * Features:
 * 1. Future-Proof Model Passthrough: Preserves new Google Gemini model names 100%
 * 2. Deprecation Guard: Sanitizes truly decommissioned models (1.5, 2.0) to prevent 404 errors
 * 3. Smart Cascade Fallback Array Generator: Multi-stage resilient fallback list
 * 4. Dynamic Short Model Formatter: RegExp-based version & tier extractor for compact UI display
 */

// Google-confirmed decommissioned models that return 404 if called
const DEPRECATED_MODELS = new Set([
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
  'gemini-2.0-flash',
  'gemini-2.0-pro',
  'gemini-2.0-flash-thinking',
  'gemini-1.0-pro'
]);

// Current stable workhorse default
export const WORKHORSE_MODEL = 'gemini-3.6-flash';
export const SPEED_MODEL = 'gemini-3.8-flash';
export const QUOTA_SAVER_MODEL = 'gemini-3.5-flash-lite';
export const FALLBACK_LITE_MODEL = 'gemini-3.1-flash-lite';

/**
 * Resolves a model name with 100% passthrough for future versions,
 * while safely remapping only confirmed dead models.
 */
export function resolveModelName(requestedModel?: string): string {
  if (!requestedModel || typeof requestedModel !== 'string') {
    return WORKHORSE_MODEL;
  }

  const trimmed = requestedModel.trim().toLowerCase();

  // Strip optional 'models/' prefix if provided
  const cleanName = trimmed.startsWith('models/') ? trimmed.substring(7) : trimmed;

  // 1. Deprecation check for Google-confirmed discontinued models
  if (DEPRECATED_MODELS.has(cleanName)) {
    console.warn(`[AI Engine] Model '${cleanName}' is deprecated. Upgraded to '${WORKHORSE_MODEL}'.`);
    return WORKHORSE_MODEL;
  }

  // 2. Common model aliases
  if (cleanName === 'gemini flash' || cleanName === 'flash') {
    return 'gemini-flash-latest';
  }
  if (cleanName === 'gemini lite' || cleanName === 'flash lite' || cleanName === 'gemini flash lite') {
    return 'gemini-3.1-flash-lite';
  }
  if (cleanName === 'gemini pro' || cleanName === 'gemini 4' || cleanName === 'gemini argon') {
    return 'gemini-4-argon';
  }

  // 3. 100% Future-Proof Pass-Through:
  // If it follows standard Gemini naming pattern /^gemini-[a-z0-9.-]+$/i
  // (e.g. gemini-3.8-flash, gemini-3.9-flash, gemini-4.0-flash, gemini-4.5-pro, etc.)
  // Keep it 100% intact as the primary model. Never convert or downgrade!
  if (/^gemini-[a-z0-9.-]+$/i.test(cleanName)) {
    return cleanName;
  }

  // Generic fallback if not empty
  return cleanName || WORKHORSE_MODEL;
}

/**
 * Builds a multi-stage cascade fallback list for any AI request:
 * 1) User's chosen model (including future versions)
 * 2) Same family models in descending order (checking registered models first)
 * 3) Workhorse stable model (gemini-3.6-flash)
 * 4) High-speed model (gemini-3.8-flash)
 * 5) Wide quota budget model (gemini-3.5-flash-lite / gemini-3.1-flash-lite)
 */
export function buildCascadeFallbackList(
  primaryModel: string,
  registeredModels: Array<{ modelId: string }> = []
): string[] {
  const target = resolveModelName(primaryModel);
  const registeredIds = registeredModels.map((m) => resolveModelName(m.modelId));

  const list: string[] = [target];

  // Determine model family
  const isLite = target.includes('lite');
  const isPro = target.includes('pro') || target.includes('argon');
  const isFlash = target.includes('flash') && !isLite;

  // Add same-family models from registered models first
  if (isLite) {
    const regLites = registeredIds.filter((id) => id.includes('lite') && id !== target);
    list.push(...regLites);
    list.push('gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest');
  } else if (isPro) {
    const regPros = registeredIds.filter(
      (id) => (id.includes('pro') || id.includes('argon')) && id !== target
    );
    list.push(...regPros);
    list.push('gemini-4-argon', 'gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-pro-latest');
  } else if (isFlash) {
    const regFlashes = registeredIds.filter(
      (id) => id.includes('flash') && !id.includes('lite') && id !== target
    );
    list.push(...regFlashes);
    list.push(
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3-flash-preview',
      'gemini-flash-latest'
    );
  }

  // Workhorse stable tier
  list.push(WORKHORSE_MODEL);

  // Speed tier
  list.push(SPEED_MODEL);

  // High-quota safety net tier
  list.push(QUOTA_SAVER_MODEL, FALLBACK_LITE_MODEL);

  // Deduplicate preserving order
  return list.filter((m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx);
}

export interface ShortModelDisplay {
  line1: string;
  line2?: string;
  line3?: string;
  badge: string;
  tier: 'flash' | 'pro' | 'lite' | 'argon' | 'standard';
}

/**
 * Dynamically formats model names into short 2-3 line displays for FloatingMenu
 * Uses Regular Expressions to extract any version numbers (\d+\.\d+) and keywords,
 * avoiding hardcoded versions so future models (e.g., 3.9, 4.0, 4.5, 5.0) render seamlessly.
 */
export function getShortModelDisplay(nameOrId: string): ShortModelDisplay {
  if (!nameOrId) {
    return { line1: '3.6', line2: 'Flash', badge: '3.6 Flash', tier: 'flash' };
  }

  // Strip prefixes like "(20)", "(500)", "(0)", "models/"
  const clean = nameOrId
    .replace(/^\(\d+\)/, '')
    .replace(/^models\//i, '')
    .replace(/^gemini-/i, '')
    .trim();

  // Extract version decimal number if any (e.g. 3.8, 4.0, 4.5, 3.1, 2.5)
  const versionMatch = clean.match(/(\d+\.\d+|\d+)/);
  const version = versionMatch ? versionMatch[0] : '';

  const lower = clean.toLowerCase();
  const hasLite = lower.includes('lite');
  const hasFlash = lower.includes('flash');
  const hasPro = lower.includes('pro');
  const hasArgon = lower.includes('argon');
  const hasUltra = lower.includes('ultra');
  const hasLatest = lower.includes('latest');
  const hasPreview = lower.includes('preview');

  let tier: ShortModelDisplay['tier'] = 'standard';
  if (hasLite) tier = 'lite';
  else if (hasPro) tier = 'pro';
  else if (hasArgon) tier = 'argon';
  else if (hasFlash) tier = 'flash';

  if (version) {
    if (hasLite) {
      return {
        line1: version,
        line2: 'Flash Lite',
        badge: `${version} Flash Lite`,
        tier: 'lite'
      };
    }
    if (hasPro) {
      return {
        line1: version,
        line2: 'Pro',
        line3: hasPreview ? 'Preview' : undefined,
        badge: `${version} Pro`,
        tier: 'pro'
      };
    }
    if (hasUltra) {
      return {
        line1: version,
        line2: 'Ultra',
        badge: `${version} Ultra`,
        tier: 'standard'
      };
    }
    // Default with version is Flash
    return {
      line1: version,
      line2: 'Flash',
      line3: hasPreview ? 'Preview' : undefined,
      badge: `${version} Flash`,
      tier: 'flash'
    };
  }

  // Without version (e.g. Flash Latest, Pro Latest, Argon)
  if (hasFlash && hasLatest) {
    return { line1: 'Flash', line2: 'Latest', badge: 'Flash Latest', tier: 'flash' };
  }
  if (hasLite && hasLatest) {
    return { line1: 'Lite', line2: 'Latest', badge: 'Lite Latest', tier: 'lite' };
  }
  if (hasPro && hasLatest) {
    return { line1: 'Pro', line2: 'Latest', badge: 'Pro Latest', tier: 'pro' };
  }
  if (hasArgon) {
    return { line1: 'Gemini 4', line2: 'Argon', badge: 'Gemini 4 Argon', tier: 'argon' };
  }

  // Fallback
  return {
    line1: clean.slice(0, 8),
    badge: clean,
    tier
  };
}
