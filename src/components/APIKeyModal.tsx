import React, { useState, useEffect } from 'react';
import { Key, Check, AlertCircle, Eye, EyeOff, Trash2, X, Sparkles, Loader2, ShieldCheck } from 'lucide-react';
import { getCustomApiKey, setCustomApiKey, removeCustomApiKey } from '../utils/aiTracker';

interface APIKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const APIKeyModal: React.FC<APIKeyModalProps> = ({ isOpen, onClose }) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setApiKey(getCustomApiKey());
      setTestStatus('idle');
      setTestMessage('');
      setSavedSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    setCustomApiKey(apiKey);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1200);
  };

  const handleRemove = () => {
    removeCustomApiKey();
    setApiKey('');
    setTestStatus('idle');
    setTestMessage('Custom API key removed. Reverted to default system key.');
  };

  const handleTestKey = async () => {
    const keyToTest = apiKey.trim() || getCustomApiKey();
    if (!keyToTest) {
      setTestStatus('invalid');
      setTestMessage('Please enter an API key to test.');
      return;
    }

    setTestStatus('testing');
    setTestMessage('Validating key with Gemini API...');

    try {
      const res = await fetch('/api/ai/test-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-api-key': keyToTest,
        },
        body: JSON.stringify({ apiKey: keyToTest }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestStatus('valid');
        setTestMessage('API Key is valid and active!');
      } else {
        setTestStatus('invalid');
        setTestMessage(data.message || 'Validation failed. Please verify your Gemini API key.');
      }
    } catch {
      // In case server proxy is not reachable, test with direct fetch
      try {
        const directRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${keyToTest}`);
        if (directRes.ok) {
          setTestStatus('valid');
          setTestMessage('API Key is valid and active!');
        } else {
          setTestStatus('invalid');
          setTestMessage('Invalid API key according to Google Gemini API.');
        }
      } catch (err: any) {
        setTestStatus('invalid');
        setTestMessage(err?.message || 'Network error while testing API key.');
      }
    }
  };

  const currentKeyActive = Boolean(getCustomApiKey());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-xl">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">Gemini API Key Settings</h3>
              <p className="text-xs text-indigo-100">Optional custom key for personal usage</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-slate-700 text-sm">
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-semibold text-slate-800">Current Key Mode:</span>
            </div>
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                currentKeyActive
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
              }`}
            >
              {currentKeyActive ? 'Custom User Key' : 'System Environment Key'}
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Personal Gemini API Key (AI Studio)
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestStatus('idle');
                  setTestMessage('');
                }}
                placeholder="AIzaSy..."
                className="w-full pr-10 pl-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              Stored securely in your local browser only. Left blank, the application automatically uses the server's attached key.
            </p>
          </div>

          {/* Test Status Feedback */}
          {testMessage && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                testStatus === 'valid'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : testStatus === 'invalid'
                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : 'bg-blue-50 text-blue-800 border-blue-200'
              }`}
            >
              {testStatus === 'testing' && <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />}
              {testStatus === 'valid' && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
              {testStatus === 'invalid' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
              <span className="leading-snug">{testMessage}</span>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTestKey}
                disabled={testStatus === 'testing' || !apiKey.trim()}
                className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                Test Key
              </button>
              {apiKey.trim() && (
                <button
                  type="button"
                  onClick={handleRemove}
                  className="py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5 border border-rose-200"
                  title="Clear custom key"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleSave}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  Saved Successfully!
                </>
              ) : (
                'Save Settings'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default APIKeyModal;
