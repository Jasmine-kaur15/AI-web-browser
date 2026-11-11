import React, { useState, useEffect } from 'react';
import {
  Key,
  ExternalLink,
  Check,
  AlertCircle,
  Shield,
  Sparkles,
  CheckCircle2,
  Zap,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import {
  UserSettings,
  GeminiModel,
  GroqModel,
  AIProvider,
  LanguageMode,
} from '../../shared/types';
import { BLACKLISTED_DOMAINS, DEFAULT_SETTINGS } from '../../shared/constants';
import { validateGeminiApiKey } from '../../background/geminiClient';
import { validateGroqApiKey } from '../../background/groqClient';

interface SettingsViewProps {
  settings: UserSettings;
  onSaveSettings: (settings: UserSettings) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onSaveSettings,
}) => {
  const [provider, setProvider] = useState<AIProvider>(settings.provider || 'groq');
  const [enableFallback, setEnableFallback] = useState<boolean>(
    settings.enableFallback ?? true
  );

  // Groq credentials & configuration
  const [groqKey, setGroqKey] = useState(
    settings.groqApiKey || DEFAULT_SETTINGS.groqApiKey || ''
  );
  const [groqModel, setGroqModel] = useState<GroqModel>(() => {
    if (
      !settings.groqModel ||
      settings.groqModel.includes('guard') ||
      settings.groqModel === 'llama-3.3-70b-versatile'
    ) {
      return 'llama-3.1-8b-instant';
    }
    return settings.groqModel;
  });
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [groqTesting, setGroqTesting] = useState(false);
  const [groqTestResult, setGroqTestResult] = useState<{
    success: boolean;
    msg: string;
  } | null>(null);

  // Gemini credentials & configuration
  const [geminiKey, setGeminiKey] = useState(
    settings.geminiApiKey || DEFAULT_SETTINGS.geminiApiKey || ''
  );
  const [geminiModel, setGeminiModel] = useState<GeminiModel>(() => {
    if (!settings.model || settings.model === 'gemini-2.0-flash') {
      return 'gemini-3.8-flash';
    }
    return settings.model;
  });
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [geminiTesting, setGeminiTesting] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<{
    success: boolean;
    msg: string;
  } | null>(null);

  // Persona & UX
  const [lang, setLang] = useState<LanguageMode>(settings.preferredLang || 'en');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (settings.provider) {
      setProvider(settings.provider);
    }
    if (settings.enableFallback !== undefined) {
      setEnableFallback(settings.enableFallback);
    }
    if (settings.groqApiKey !== undefined) {
      setGroqKey(settings.groqApiKey || DEFAULT_SETTINGS.groqApiKey || '');
    }
    if (settings.groqModel) {
      if (
        settings.groqModel.includes('guard') ||
        settings.groqModel === 'llama-3.3-70b-versatile'
      ) {
        setGroqModel('llama-3.1-8b-instant');
      } else {
        setGroqModel(settings.groqModel);
      }
    }
    if (settings.geminiApiKey !== undefined) {
      setGeminiKey(settings.geminiApiKey || DEFAULT_SETTINGS.geminiApiKey || '');
    }
    if (settings.model && settings.model !== 'gemini-2.0-flash') {
      setGeminiModel(settings.model);
    }
    if (settings.preferredLang) {
      setLang(settings.preferredLang);
    }
  }, [settings]);

  const handleTestGroq = async () => {
    setSaveError(null);
    setGroqTestResult(null);

    const cleanKey = groqKey.trim() || DEFAULT_SETTINGS.groqApiKey;
    if (!cleanKey) {
      setGroqTestResult({
        success: false,
        msg: 'Please enter a Groq API key (starts with gsk_).',
      });
      return;
    }

    setGroqTesting(true);
    const result = await validateGroqApiKey(cleanKey, groqModel);
    setGroqTestResult({
      success: result.success,
      msg: result.message,
    });
    if (result.availableModels?.length) {
      setDiscoveredModels(result.availableModels);
    }
    if (result.model && result.model !== groqModel) {
      setGroqModel(result.model as GroqModel);
    }
    setGroqTesting(false);
  };

  const handleTestGemini = async () => {
    setSaveError(null);
    setGeminiTestResult(null);

    const cleanKey = geminiKey.trim() || DEFAULT_SETTINGS.geminiApiKey;
    if (!cleanKey) {
      setGeminiTestResult({
        success: false,
        msg: 'Please enter a Google Gemini API key.',
      });
      return;
    }

    setGeminiTesting(true);
    const result = await validateGeminiApiKey(cleanKey, geminiModel);
    setGeminiTestResult({
      success: result.success,
      msg: result.message,
    });
    setGeminiTesting(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    const cleanGroqKey = (groqKey || DEFAULT_SETTINGS.groqApiKey || '').trim();
    const cleanGeminiKey = (geminiKey || DEFAULT_SETTINGS.geminiApiKey || '').trim();

    if (!cleanGroqKey && !cleanGeminiKey) {
      setSaveError('Please provide at least one valid API Key (Groq or Google Gemini).');
      return;
    }

    await onSaveSettings({
      provider,
      fallbackProvider: provider === 'groq' ? 'gemini' : 'groq',
      enableFallback,
      groqApiKey: cleanGroqKey,
      groqModel,
      geminiApiKey: cleanGeminiKey,
      model: geminiModel,
      preferredLang: lang,
    });

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900">
      {/* Header */}
      <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800">
        <div className="w-8 h-8 rounded-lg bg-sky-950/60 border border-sky-800/60 flex items-center justify-center text-sky-400">
          <Key className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-100">AI Providers & Settings</h2>
          <p className="text-[11px] text-slate-400">
            Groq LPU (Primary) + Google Gemini (Auto-Fallback)
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {/* Architecture Pipeline Banner */}
        <div className="p-3 bg-gradient-to-r from-amber-950/40 via-slate-900 to-sky-950/40 border border-slate-800 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-300">
              Active Dual-Provider Pipeline
            </span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-800 text-emerald-300 flex items-center gap-1">
              <Check className="w-3 h-3 text-emerald-400" /> Auto-Failover Active
            </span>
          </div>

          <div className="flex items-center gap-2 py-1">
            <div className="flex-1 p-2 rounded-lg bg-amber-950/30 border border-amber-800/40 flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-amber-900/50 flex items-center justify-center text-amber-400 shrink-0">
                <Zap className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-amber-200 truncate">
                  Groq LPU (Primary)
                </div>
                <div className="text-[9px] text-amber-400/80 font-mono">
                  {groqModel}
                </div>
              </div>
            </div>

            <ArrowRight className="w-4 h-4 text-slate-500 shrink-0" />

            <div className="flex-1 p-2 rounded-lg bg-sky-950/30 border border-sky-800/40 flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-sky-900/50 flex items-center justify-center text-sky-400 shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-sky-200 truncate">
                  Gemini (Fallback)
                </div>
                <div className="text-[9px] text-sky-400/80 font-mono">
                  {geminiModel}
                </div>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-slate-400 leading-relaxed">
            Requests are sent to <strong className="text-amber-300">Groq first</strong> at blazing speed. If Groq hits a rate limit (HTTP 429), quota, or service issue, Sahayak <strong className="text-sky-300">automatically retries with Gemini</strong> keeping all context intact.
          </p>

          <label className="flex items-center gap-2 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={enableFallback}
              onChange={(e) => setEnableFallback(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-0"
            />
            <span className="text-[11px] text-slate-300 font-medium">
              Enable automatic fallback to Gemini on Groq error/rate limit
            </span>
          </label>
        </div>

        {/* Provider Switcher Tabs */}
        <div className="glass-panel p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl space-y-2">
          <label className="text-xs font-semibold text-slate-200 block">
            Configure Provider Credentials
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setProvider('groq');
                setSaveError(null);
              }}
              className={`py-2 px-3 text-xs font-semibold rounded-lg border transition flex items-center justify-center gap-1.5 ${
                provider === 'groq'
                  ? 'bg-amber-950/70 border-amber-500 text-amber-300 shadow-sm'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Groq (Primary)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setProvider('gemini');
                setSaveError(null);
              }}
              className={`py-2 px-3 text-xs font-semibold rounded-lg border transition flex items-center justify-center gap-1.5 ${
                provider === 'gemini'
                  ? 'bg-sky-950/70 border-sky-500 text-sky-400 shadow-sm'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              <span>Google Gemini (Fallback)</span>
            </button>
          </div>
        </div>

        {/* PROVIDER: Groq Configuration */}
        {provider === 'groq' && (
          <div className="glass-panel p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Groq API Key (Primary)</span>
              </label>
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium"
              >
                Get Free Groq Key <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="relative">
              <input
                type={showGroqKey ? 'text' : 'password'}
                value={groqKey}
                onChange={(e) => {
                  setGroqKey(e.target.value);
                  setGroqTestResult(null);
                  setSaveError(null);
                }}
                placeholder="gsk_..."
                className={`input-field text-xs pr-14 py-2 font-mono bg-slate-950 ${
                  groqTestResult && !groqTestResult.success
                    ? 'border-rose-500 focus:border-rose-500'
                    : groqTestResult?.success
                    ? 'border-emerald-500 focus:border-emerald-500'
                    : 'border-slate-700'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowGroqKey(!showGroqKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700"
              >
                {showGroqKey ? 'Hide' : 'Show'}
              </button>
            </div>

            {/* Groq Model Selector */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 block">
                  Groq Model
                </label>
                {discoveredModels.length > 0 && (
                  <span className="text-[10px] text-emerald-400 font-mono">
                    ✓ {discoveredModels.length} models detected on your key
                  </span>
                )}
              </div>
              <select
                value={groqModel}
                onChange={(e) => {
                  setGroqModel(e.target.value as GroqModel);
                  setGroqTestResult(null);
                }}
                className="input-field text-xs py-2 bg-slate-950 border-slate-700 cursor-pointer"
              >
                {discoveredModels.length > 0 ? (
                  discoveredModels.map((m) => (
                    <option key={m} value={m}>
                      {m} {m === 'llama-3.1-8b-instant' ? '(Recommended - Blazing Fast)' : ''}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="llama-3.1-8b-instant">
                      Llama 3.1 8B Instant (Recommended: 560+ tok/s, Free Tier Accessible)
                    </option>
                    <option value="llama-3.3-70b-versatile">
                      Llama 3.3 70B Versatile (70B Reasoning, May require Tier 1+)
                    </option>
                    <option value="llama3-70b-8192">
                      Llama 3 70B (8k Context)
                    </option>
                    <option value="llama3-8b-8192">
                      Llama 3 8B (8k Context)
                    </option>
                    <option value="gemma2-9b-it">
                      Google Gemma 2 9B IT
                    </option>
                    <option value="mixtral-8x7b-32768">
                      Mixtral 8x7B (32k Context Window)
                    </option>
                  </>
                )}
              </select>
              <p className="text-[10px] text-slate-400">
                <strong className="text-amber-300">Llama 3.1 8B Instant</strong> delivers high-speed LPU inference with generous free rate limits (14,400 requests/day).
              </p>
            </div>

            {/* Test Groq Button */}
            <div className="pt-1 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestGroq}
                  disabled={groqTesting || (!groqKey.trim() && !DEFAULT_SETTINGS.groqApiKey)}
                  className="btn-secondary text-[11px] py-1.5 px-3 flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${groqTesting ? 'animate-spin' : ''}`} />
                  <span>{groqTesting ? 'Testing Groq...' : 'Test Groq Connection'}</span>
                </button>
              </div>

              {groqTestResult && (
                <div
                  className={`p-2 rounded-lg border text-xs flex items-start gap-2 ${
                    groqTestResult.success
                      ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
                  }`}
                >
                  {groqTestResult.success ? (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <span className="leading-snug">{groqTestResult.msg}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PROVIDER: Google Gemini Configuration */}
        {provider === 'gemini' && (
          <div className="glass-panel p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                <span>Google Gemini API Key (Fallback)</span>
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 font-medium"
              >
                Get Free Gemini Key <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="relative">
              <input
                type={showGeminiKey ? 'text' : 'password'}
                value={geminiKey}
                onChange={(e) => {
                  setGeminiKey(e.target.value);
                  setGeminiTestResult(null);
                  setSaveError(null);
                }}
                placeholder="AIzaSy... or AQ..."
                className={`input-field text-xs pr-14 py-2 font-mono bg-slate-950 ${
                  geminiTestResult && !geminiTestResult.success
                    ? 'border-rose-500 focus:border-rose-500'
                    : geminiTestResult?.success
                    ? 'border-emerald-500 focus:border-emerald-500'
                    : 'border-slate-700'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowGeminiKey(!showGeminiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700"
              >
                {showGeminiKey ? 'Hide' : 'Show'}
              </button>
            </div>

            {/* Gemini Model Selector */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 block">
                Gemini Model
              </label>
              <select
                value={geminiModel}
                onChange={(e) => {
                  setGeminiModel(e.target.value as GeminiModel);
                  setGeminiTestResult(null);
                }}
                className="input-field text-xs py-2 bg-slate-950 border-slate-700 cursor-pointer"
              >
                <option value="gemini-3.8-flash">Gemini 3.8 Flash (Recommended)</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash (Legacy)</option>
              </select>
            </div>

            {/* Test Gemini Button */}
            <div className="pt-1 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestGemini}
                  disabled={geminiTesting || (!geminiKey.trim() && !DEFAULT_SETTINGS.geminiApiKey)}
                  className="btn-secondary text-[11px] py-1.5 px-3 flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${geminiTesting ? 'animate-spin' : ''}`} />
                  <span>{geminiTesting ? 'Testing Gemini...' : 'Test Gemini Connection'}</span>
                </button>
              </div>

              {geminiTestResult && (
                <div
                  className={`p-2 rounded-lg border text-xs flex items-start gap-2 ${
                    geminiTestResult.success
                      ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
                  }`}
                >
                  {geminiTestResult.success ? (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <span className="leading-snug">{geminiTestResult.msg}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Global Save Errors */}
        {saveError && (
          <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{saveError}</span>
          </div>
        )}

        {/* Preferred Language */}
        <div className="glass-panel p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl space-y-2">
          <label className="text-xs font-semibold text-slate-200 block">
            Default Language Persona
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`py-2 text-xs font-semibold rounded-lg border transition ${
                lang === 'en'
                  ? 'bg-sky-950/70 border-sky-500 text-sky-400 shadow-sm'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              English (Global)
            </button>
            <button
              type="button"
              onClick={() => setLang('hinglish')}
              className={`py-2 text-xs font-semibold rounded-lg border transition ${
                lang === 'hinglish'
                  ? 'bg-sky-950/70 border-sky-500 text-sky-400 shadow-sm'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              Hinglish (हिंदी-English)
            </button>
          </div>
          <p className="text-[10px] text-slate-400">
            You can also toggle language anytime using the header pill.
          </p>
        </div>

        {/* Security Guard Info */}
        <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 text-[11px] text-slate-400 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-slate-300">
            <Shield className="w-3.5 h-3.5 text-sky-400" />
            <span>Active Safety Guard</span>
          </div>
          <p className="leading-relaxed">
            Keys are strictly stored in <code className="text-sky-300 font-mono">chrome.storage.local</code>. Sahayak is strictly locked out of banking and financial domains ({BLACKLISTED_DOMAINS.slice(0, 3).join(', ')}). Password fields are never scanned.
          </p>
        </div>

        {/* Save Button */}
        <div className="pt-2 flex items-center justify-between">
          <button
            type="submit"
            disabled={groqTesting || geminiTesting}
            className="btn-primary text-xs py-2 px-5 flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Save Settings</span>
          </button>
          {savedSuccess && (
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Settings saved!
            </span>
          )}
        </div>
      </form>
    </div>
  );
};
