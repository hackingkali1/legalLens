'use client';

import React, { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export interface UseModalFocusTrapOptions {
  isOpen: boolean;
  onClose: () => void;
  modalRef: React.RefObject<HTMLElement | null>;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  restoreFocus?: boolean;
}

export function useModalFocusTrap({
  isOpen,
  onClose,
  modalRef,
  initialFocusRef,
  restoreFocus = true,
}: UseModalFocusTrapOptions) {
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // 1. Capture the previously active element to restore focus when closed
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      previousActiveElement.current = document.activeElement;
    }

    // 2. Set initial focus inside the modal
    const focusTimer = setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else if (modalRef.current) {
        const focusables = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusables.length > 0) {
          focusables[0].focus();
        } else {
          modalRef.current.focus();
        }
      }
    }, 10);

    // 3. Handle Escape to close and Tab / Shift+Tab focus trap
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusables = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0);

        if (focusables.length === 0) {
          e.preventDefault();
          modalRef.current.focus();
          return;
        }

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          // Shift + Tab
          if (document.activeElement === firstElement || document.activeElement === modalRef.current) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown, true);

      // 4. Return focus to the triggering element upon closing
      if (restoreFocus && previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        const toFocus = previousActiveElement.current;
        setTimeout(() => {
          if (document.body.contains(toFocus)) {
            toFocus.focus();
          }
        }, 10);
      }
    };
  }, [isOpen, onClose, modalRef, initialFocusRef, restoreFocus]);
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  titleId?: string;
  className?: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  titleId,
  className = 'w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-xl p-6',
  initialFocusRef,
  children,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);

  useModalFocusTrap({
    isOpen,
    onClose,
    modalRef,
    initialFocusRef,
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={className}
      >
        {children}
      </div>
    </div>
  );
}
