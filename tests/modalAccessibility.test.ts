import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/upload/route';
import fs from 'fs';
import path from 'path';

describe('Modal Accessibility & Zero Document Content Logging', () => {
  describe('Security: Zero Document Content or Snippet in Logging', () => {
    it('confirms safeRedactPreview has been completely eliminated from the codebase', () => {
      function scanForFunction(dir: string): string[] {
        let matches: string[] = [];
        for (const file of fs.readdirSync(dir)) {
          const fullPath = path.join(dir, file);
          if (['node_modules', '.next', '.git'].includes(file)) continue;
          if (fs.statSync(fullPath).isDirectory()) {
            matches = matches.concat(scanForFunction(fullPath));
          } else if (/\.(ts|tsx|js|mjs)$/.test(file)) {
            // Exclude this test file itself
            if (file === 'modalAccessibility.test.ts') continue;
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes('safeRedactPreview')) {
              matches.push(fullPath);
            }
          }
        }
        return matches;
      }

      const occurrences = scanForFunction(process.cwd());
      expect(occurrences).toEqual([]);
    });

    it('logs only file metadata (fileType, size, status: success) and ZERO document text on upload', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const confidentialText =
        'CONFIDENTIAL EMPLOYMENT CONTRACT. BASE SALARY: $250,000 PER ANNUM. PARTY: ALICE SMITH.';

      const req = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: confidentialText,
          fileName: 'confidential_employment.txt',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      // Verify the logged statement
      const uploadLogCall = logSpy.mock.calls.find((call) =>
        String(call[0]).includes('[LegalLens Upload]')
      );
      expect(uploadLogCall).toBeDefined();

      const logMessage = String(uploadLogCall![0]);
      // Verify metadata is logged without fileName/title to protect privacy
      expect(logMessage).toContain('txt');
      expect(logMessage).toContain('bytes');
      expect(logMessage).toContain('status: success');
      expect(logMessage).not.toContain('confidential_employment.txt');

      // CRITICAL: Verify none of the document text or sensitive terms are in the log
      expect(logMessage).not.toContain('CONFIDENTIAL EMPLOYMENT CONTRACT');
      expect(logMessage).not.toContain('BASE SALARY');
      expect(logMessage).not.toContain('250,000');
      expect(logMessage).not.toContain('ALICE SMITH');
      expect(logMessage).not.toContain('preview');

      logSpy.mockRestore();
    });
  });

  describe('Accessibility: Shared Modal Component Structure & Semantics', () => {
    it('Modal component file exists and exports Modal and useModalFocusTrap', async () => {
      const modalModule = await import('@/components/ui/Modal');
      expect(modalModule.Modal).toBeDefined();
      expect(modalModule.useModalFocusTrap).toBeDefined();
    });

    it('confirms all application modals utilize the shared Modal wrapper and declare role="dialog" and aria-modal="true"', () => {
      const uploadAreaCode = fs.readFileSync(
        path.resolve(process.cwd(), 'components/upload/DocumentUploadArea.tsx'),
        'utf8'
      );
      const checklistModalCode = fs.readFileSync(
        path.resolve(process.cwd(), 'components/export/LawyerChecklistModal.tsx'),
        'utf8'
      );

      // Verify modals use <Modal
      expect(uploadAreaCode).toContain('<Modal');
      expect(checklistModalCode).toContain('<Modal');

      // Modal.tsx defines role="dialog" and aria-modal="true"
      const modalCode = fs.readFileSync(
        path.resolve(process.cwd(), 'components/ui/Modal.tsx'),
        'utf8'
      );
      expect(modalCode).toContain('role="dialog"');
      expect(modalCode).toContain('aria-modal="true"');
      expect(modalCode).toContain("e.key === 'Escape'");
      expect(modalCode).toContain("e.key === 'Tab'");
      expect(modalCode).toContain('previousActiveElement');
    });
  });
});
