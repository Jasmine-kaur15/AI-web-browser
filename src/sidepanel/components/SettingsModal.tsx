import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  ExternalLink,
  Check,
  AlertCircle,
  Shield,
  Sparkles,
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

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: UserSettings;
  onSaveSettings: (settings: UserSettings) => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}) => {
  if (!isOpen) return null;

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

  useEffect(() => {
    if (settings.provider) setProvider(settings.provider);
    if (settings.enableFallback !== undefined) setEnableFallback(settings.enableFallback);
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
    if (settings.model && settings.model !== 'gemini-2.0-flash') setGeminiModel(settings.model);
    if (settings.preferredLang) setLang(settings.preferredLang);
  }, [settings]);

  const handleTestGroq = async () => {
    setSaveError(null);
    setGroqTestResult(null);

    const cleanKey = groqKey.trim() || DEFAULT_SETTINGS.groqApiKey;
    if (!cleanKey) {
      setGroqTestResult({
        success: false,
        msg: 'Please enter a Groq API key.',
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

  const handleSave = async () => {
    setSaveError(null);
    const cleanGroqKey = (groqKey || DEFAULT_SETTINGS.groqApiKey || '').trim();
    const cleanGeminiKey = (geminiKey || DEFAULT_SETTINGS.geminiApiKey || '').trim();

    if (!cleanGroqKey && !cleanGeminiKey) {
      setSaveError('Please provide at least one API Key (Groq or Google Gemini).');
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
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 animate-in fade-in duration-150">
      <div className="w-full max-w-sm max-h-[92vh] overflow-y-auto glass-panel bg-slate-900 border border-slate-700 p-4 rounded-xl shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-bold text-slate-100">Sahayak Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Dual Provider Pipeline Summary */}
        <div className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-200">
            <span>Dual-Provider Failover</span>
            <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-normal">
              <Check className="w-3 h-3" /> Auto-Retry Enabled
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="text-amber-300 font-semibold">Groq (Primary)</span>
            <ArrowRight className="w-3 h-3 text-slate-500" />
            <span className="text-sky-300 font-semibold">Gemini (Fallback)</span>
          </div>
          <label className="flex items-center gap-2 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={enableFallback}
              onChange={(e) => setEnableFallback(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-0"
            />
            <span className="text-[10px] text-slate-300">
              Auto-retry with Gemini on Groq error/rate limit
            </span>
          </label>
        </div>

        {/* Provider Switcher */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-200 block">
            Configure Provider
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setProvider('groq');
                setSaveError(null);
              }}
              className={`py-1.5 px-2 text-xs font-semibold rounded-lg border transition flex items-center justify-center gap-1.5 ${
                provider === 'groq'
                  ? 'bg-amber-950/70 border-amber-500 text-amber-300'
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
              className={`py-1.5 px-2 text-xs font-semibold rounded-lg border transition flex items-center justify-center gap-1.5 ${
                provider === 'gemini'
                  ? 'bg-sky-950/70 border-sky-500 text-sky-400'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              <span>Gemini (Fallback)</span>
            </button>
          </div>
        </div>

        {/* PROVIDER: Groq */}
        {provider === 'groq' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Groq API Key</span>
              </label>
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-amber-400 hover:underline flex items-center gap-1"
              >
                Get Free Key <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="relative">
              <input
                type={showGroqKey ? 'text' : 'password'}
                value={groqKey}
                onChange={(e) => {
                  setGroqKey(e.target.value);
                  setGroqTestResult(null);
                }}
                placeholder="gsk_..."
                className="input-field text-xs pr-14 py-2 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowGroqKey(!showGroqKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded bg-slate-800"
              >
                {showGroqKey ? 'Hide' : 'Show'}
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 block">
                Groq Model
              </label>
              <select
                value={groqModel}
                onChange={(e) => {
                  setGroqModel(e.target.value as GroqModel);
                  setGroqTestResult(null);
                }}
                className="input-field text-xs py-2 bg-slate-950 border-slate-700"
              >
                {discoveredModels.length > 0 ? (
                  discoveredModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="llama-3.1-8b-instant">Llama 3.1 8B Instant (Ultra-Fast)</option>
                    <option value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile</option>
                    <option value="llama3-70b-8192">Llama 3 70B</option>
                    <option value="llama3-8b-8192">Llama 3 8B</option>
                    <option value="gemma2-9b-it">Google Gemma 2 9B</option>
                    <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
                  </>
                )}
              </select>
            </div>

            <div className="pt-1 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleTestGroq}
                disabled={groqTesting || (!groqKey.trim() && !DEFAULT_SETTINGS.groqApiKey)}
                className="btn-secondary text-[11px] py-1.5 px-3 flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${groqTesting ? 'animate-spin' : ''}`} />
                <span>{groqTesting ? 'Testing...' : 'Test Groq Connection'}</span>
              </button>

              {groqTestResult && (
                <div
                  className={`p-2 rounded-lg border text-xs flex items-start gap-1.5 ${
                    groqTestResult.success
                      ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-800 text-rose-300'
                  }`}
                >
                  {groqTestResult.success ? (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{groqTestResult.msg}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PROVIDER: Gemini */}
        {provider === 'gemini' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                <span>Gemini API Key</span>
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-sky-400 hover:underline flex items-center gap-1"
              >
                Get Free Key <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="relative">
              <input
                type={showGeminiKey ? 'text' : 'password'}
                value={geminiKey}
                onChange={(e) => {
                  setGeminiKey(e.target.value);
                  setGeminiTestResult(null);
                }}
                placeholder="AIzaSy... or AQ..."
                className="input-field text-xs pr-14 py-2 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowGeminiKey(!showGeminiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded bg-slate-800"
              >
                {showGeminiKey ? 'Hide' : 'Show'}
              </button>
            </div>

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
                className="input-field text-xs py-2 bg-slate-950 border-slate-700"
              >
                <option value="gemini-3.8-flash">Gemini 3.8 Flash (Recommended)</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash (Legacy)</option>
              </select>
            </div>

            <div className="pt-1 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleTestGemini}
                disabled={geminiTesting || (!geminiKey.trim() && !DEFAULT_SETTINGS.geminiApiKey)}
                className="btn-secondary text-[11px] py-1.5 px-3 flex items-center justify-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${geminiTesting ? 'animate-spin' : ''}`} />
                <span>{geminiTesting ? 'Testing...' : 'Test Gemini Connection'}</span>
              </button>

              {geminiTestResult && (
                <div
                  className={`p-2 rounded-lg border text-xs flex items-start gap-1.5 ${
                    geminiTestResult.success
                      ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-800 text-rose-300'
                  }`}
                >
                  {geminiTestResult.success ? (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{geminiTestResult.msg}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Global Save Error */}
        {saveError && (
          <div className="p-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-200 text-xs flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
            <span>{saveError}</span>
          </div>
        )}

        {/* Language Selection */}
        <div className="space-y-1.5 pt-1">
          <label className="text-xs font-semibold text-slate-300 block">
            Persona Language
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`py-1.5 text-xs font-semibold rounded-lg border transition ${
                lang === 'en'
                  ? 'bg-sky-950/70 border-sky-500 text-sky-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLang('hinglish')}
              className={`py-1.5 text-xs font-semibold rounded-lg border transition ${
                lang === 'hinglish'
                  ? 'bg-sky-950/70 border-sky-500 text-sky-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              Hinglish
            </button>
          </div>
        </div>

        {/* Save Actions */}
        <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary text-xs py-1.5 px-3"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={groqTesting || geminiTesting}
            className="btn-primary text-xs py-1.5 px-4"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
