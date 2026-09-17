'use client';

import React, { useState, useEffect } from 'react';
import { KeyRound, Check, X, ShieldCheck, ExternalLink } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeySaved?: () => void;
}

export const SESSION_KEY_STORAGE = 'legallens_nvidia_api_key';

export function getSessionApiKey(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return (
    sessionStorage.getItem(SESSION_KEY_STORAGE) ||
    sessionStorage.getItem('legallens_openrouter_api_key') ||
    sessionStorage.getItem('legallens_anthropic_api_key') ||
    undefined
  );
}

export function ApiKeyModal({ isOpen, onClose, onKeySaved }: ApiKeyModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = getSessionApiKey();
      if (stored) {
        setApiKey(stored);
        setHasExistingKey(true);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim().startsWith('nvapi-') || apiKey.trim().length > 10) {
      sessionStorage.setItem(SESSION_KEY_STORAGE, apiKey.trim());
      setHasExistingKey(true);
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
        if (onKeySaved) onKeySaved();
      }, 700);
    }
  };

  const handleClear = () => {
    sessionStorage.removeItem(SESSION_KEY_STORAGE);
    sessionStorage.removeItem('legallens_openrouter_api_key');
    sessionStorage.removeItem('legallens_anthropic_api_key');
    setApiKey('');
    setHasExistingKey(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      titleId="api-key-modal-title"
      className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-6 relative"
    >
      <div>
        <button
          onClick={onClose}
          aria-label="Close API Key configuration"
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 rounded-lg p-1 focus-visible:ring-2"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-xl">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h2 id="api-key-modal-title" className="text-lg font-bold text-slate-900">
              NVIDIA NIM API Key
            </h2>
            <p className="text-xs text-slate-500">
              Session Configuration (Nemotron Models)
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-600 mb-4 leading-relaxed">
          LegalLens connects to AI models via NVIDIA NIM (Nemotron models). If not configured on your server in <code className="px-1.5 py-0.5 bg-slate-100 rounded text-xs text-slate-800">.env.local</code> as <code className="px-1.5 py-0.5 bg-slate-100 rounded text-xs text-slate-800">NVIDIA_API_KEY</code>, you can provide your key here. It is stored <strong>only in this browser session</strong> and never permanently saved.
        </p>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label htmlFor="nvidia-key-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
              API Key (nvapi-...)
            </label>
            <input
              id="nvidia-key-input"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="nvapi-..."
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            {hasExistingKey ? (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-rose-600 hover:text-rose-700 font-medium underline"
              >
                Clear saved session key
              </button>
            ) : <div />}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!apiKey.trim()}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-xs"
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <span>Save Key</span>
                )}
              </button>
            </div>
          </div>
        </form>

        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1 text-emerald-700 font-medium">
            <ShieldCheck className="w-4 h-4" /> Client session encrypted in memory
          </span>
          <a
            href="https://build.nvidia.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 hover:underline inline-flex items-center gap-1"
          >
            Get NVIDIA Key <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </Modal>
  );
}
