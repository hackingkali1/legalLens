'use client';

import React, { useState, useRef } from 'react';
import { Upload, FileText, FileUp, AlertCircle, Loader2, Sparkles, Clipboard } from 'lucide-react';
import { LegalLensDocument } from '@/types/document';
import { SAMPLE_LEASE_TEXT, SAMPLE_NDA_V1_TEXT } from '@/lib/fixtures/samples';
import { Modal } from '@/components/ui/Modal';
import { getUserSafeErrorMessage } from '@/lib/validation/userSafeError';

interface DocumentUploadAreaProps {
  onDocumentLoaded: (doc: LegalLensDocument) => void;
  isLoading?: boolean;
}

export function DocumentUploadArea({ onDocumentLoaded, isLoading: parentLoading }: DocumentUploadAreaProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState(
    'Extracting text layer, verifying integrity, and identifying contract sections...'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [pastedTitle, setPastedTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLoading = parentLoading || isUploading;

  const processFile = async (file: File) => {
    setErrorMessage(null);
    setIsUploading(true);
    setUploadStatusText('Uploading and analyzing document...');

    // If PDF processing takes time, it's typically undergoing OCR
    const progressTimer = setTimeout(() => {
      setUploadStatusText('Scanned PDF detected. Running OCR text extraction (this may take a few moments)...');
    }, 2500);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload and parse document.');
      }

      onDocumentLoaded(data);
    } catch (err: unknown) {
      const msg = getUserSafeErrorMessage(err, 'Failed to upload and parse document. Please try again.');
      setErrorMessage(msg);
    } finally {
      clearTimeout(progressTimer);
      setIsUploading(false);
      setUploadStatusText('Extracting text layer, verifying integrity, and identifying contract sections...');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePastedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastedText.trim()) return;

    setErrorMessage(null);
    setIsUploading(true);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: pastedText,
          fileName: pastedTitle.trim() || 'Pasted Legal Agreement',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to parse pasted text.');
      }

      setPasteModalOpen(false);
      setPastedText('');
      setPastedTitle('');
      onDocumentLoaded(data);
    } catch (err: unknown) {
      const msg = getUserSafeErrorMessage(err, 'Failed to parse pasted text. Please try again.');
      setErrorMessage(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const loadSample = async (sampleText: string, title: string) => {
    setErrorMessage(null);
    setIsUploading(true);
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sampleText,
          fileName: title,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load sample document.');
      onDocumentLoaded(data);
    } catch (err: unknown) {
      const msg = getUserSafeErrorMessage(err, 'Failed to load sample document. Please try again.');
      setErrorMessage(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  return (
    <div className="w-full">
      {/* Upload Box */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        role="region"
        aria-label="Document upload dropzone"
        className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all ${
          isDragging
            ? 'border-indigo-600 bg-indigo-50/50'
            : 'border-slate-300 hover:border-indigo-400 bg-white shadow-xs'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              processFile(e.target.files[0]);
            }
          }}
          className="sr-only"
          id="file-upload-input"
          disabled={isLoading}
        />

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-6">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
            <h3 className="text-lg font-semibold text-slate-800">
              Processing Document...
            </h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm">
              {uploadStatusText}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 shadow-xs">
              <Upload className="w-8 h-8" aria-hidden="true" />
            </div>

            <h3 className="text-xl font-bold text-slate-900 mb-2">
              Upload your document to simplify
            </h3>

            <p className="text-sm text-slate-600 max-w-md mb-6 leading-relaxed">
              Drag & drop your PDF, DOCX, or TXT file here, or browse from your computer.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <label
                htmlFor="file-upload-input"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-xs cursor-pointer focus-visible:ring-2 transition-colors"
              >
                <FileUp className="w-4 h-4" />
                Browse File
              </label>

              <button
                type="button"
                onClick={() => setPasteModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium focus-visible:ring-2 transition-colors"
              >
                <Clipboard className="w-4 h-4 text-slate-500" />
                Paste Text
              </button>
            </div>

            <p className="text-xs text-slate-400 mt-5">
              Supported formats: PDF (including scanned PDFs via OCR), Word (.docx), Plain text (.txt) &bull; Maximum file size: 10 MB &bull; Processed securely in-session
            </p>
          </div>
        )}
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div
          role="alert"
          className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-start gap-3 shadow-xs"
        >
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold block mb-0.5">Upload Error</span>
            {errorMessage}
          </div>
        </div>
      )}

      {/* Quick Demo Starters */}
      <div className="mt-6 pt-6 border-t border-slate-200">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> Or test immediately with sample agreements:
          </span>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => loadSample(SAMPLE_LEASE_TEXT, 'Sample_Residential_Lease_Agreement.txt')}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-700 transition-colors shadow-2xs"
            >
              📄 Try Residential Lease Agreement
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => loadSample(SAMPLE_NDA_V1_TEXT, 'Sample_Mutual_NDA_2025.txt')}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-700 transition-colors shadow-2xs"
            >
              🔒 Try Mutual NDA
            </button>
          </div>
        </div>
      </div>

      {/* Paste Text Modal */}
      <Modal
        isOpen={pasteModalOpen}
        onClose={() => setPasteModalOpen(false)}
        titleId="paste-text-modal-title"
        className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-xl p-6"
      >
        <h3 id="paste-text-modal-title" className="text-lg font-bold text-slate-900 mb-1">
              Paste Legal Document Text
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Paste terms of service, an employment contract, NDA, or lease excerpt below.
            </p>

            <form onSubmit={handlePastedSubmit} className="space-y-4">
              <div>
                <label htmlFor="pasted-title-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Document Title (optional)
                </label>
                <input
                  id="pasted-title-input"
                  type="text"
                  value={pastedTitle}
                  onChange={(e) => setPastedTitle(e.target.value)}
                  placeholder="e.g., Software Service Agreement"
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none"
                />
              </div>

              <div>
                <label htmlFor="pasted-text-input" className="block text-xs font-medium text-slate-700 mb-1">
                  Agreement Text <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="pasted-text-input"
                  rows={10}
                  required
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Paste contract sections, clauses, or full agreement text here..."
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono text-slate-800 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPasteModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!pastedText.trim() || isLoading}
                  className="px-5 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  Parse & Simplify Text
                </button>
              </div>
            </form>
      </Modal>
    </div>
  );
}
