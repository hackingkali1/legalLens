import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { parseDocxBuffer } from '@/lib/parsing/docx';

describe('Flow 2: Binary DOCX Real-World Parsing', () => {
  async function createRealDocxFixture(): Promise<Buffer> {
    const zip = new JSZip();

    // 1. [Content_Types].xml declaring relationships, document, header, and footer
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`
    );

    // 2. Package relationships
    zip.file(
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
    );

    // 3. Document part relationships (linking header and footer)
    zip.file(
      'word/_rels/document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`
    );

    // 4. Header XML with legal confidentiality notice
    zip.file(
      'word/header1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:r><w:t>CONFIDENTIAL ATTORNEY-CLIENT PRIVILEGED - MUTUAL NDA</w:t></w:r>
  </w:p>
</w:hdr>`
    );

    // 5. Footer XML with governing law and page info
    zip.file(
      'word/footer1.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:r><w:t>Page 1 of 5 - Governing Law: State of Delaware</w:t></w:r>
  </w:p>
</w:ftr>`
    );

    // 6. Main Document XML containing headings, body text, and nested XML tables
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>MASTER SERVICES AGREEMENT</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>This Master Services Agreement is entered into by and between Enterprise Inc and Vendor LLC.</w:t></w:r>
    </w:p>
    
    <!-- Outer Table with Service Milestones and Penalties -->
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Deliverable Milestone</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Completion Deadline</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Late Penalty Fee</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Phase 1 Security Audit</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>30 Calendar Days</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>$2,500 per business day</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc>
          <w:p><w:r><w:t>Phase 2 Deployment Schedule</w:t></w:r></w:p>
          <!-- Nested Inner XML Table -->
          <w:tbl>
            <w:tr>
              <w:tc><w:p><w:r><w:t>Nested Sub-task: Database Migration</w:t></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:t>Requirement: Zero Data Loss</w:t></w:r></w:p></w:tc>
            </w:tr>
          </w:tbl>
        </w:tc>
        <w:tc><w:p><w:r><w:t>60 Calendar Days</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>$5,000 per business day</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>

    <w:p>
      <w:r><w:t>SECTION 2. INDEMNIFICATION AND LIABILITY LIMITS</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Each party agrees to indemnify and hold harmless the other against any third-party claims up to $1,000,000.</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`
    );

    return await zip.generateAsync({ type: 'nodebuffer' });
  }

  it('successfully extracts text from real zip-compressed .docx fixture with nested tables, headers, and footers', async () => {
    const docxBuffer = await createRealDocxFixture();
    expect(docxBuffer.length).toBeGreaterThan(100);

    const result = await parseDocxBuffer(docxBuffer);
    console.log('\n--- [DOCX EXTRACTED TEXT SAMPLE START] ---\n' + result.text + '\n--- [DOCX EXTRACTED TEXT SAMPLE END] ---\n');
    expect(result).toBeDefined();
    expect(result.text).toBeTypeOf('string');

    // 1. Header text extraction (flagged bug resolved: mammoth ignores header XML by default)
    expect(result.text).toContain('CONFIDENTIAL ATTORNEY-CLIENT PRIVILEGED - MUTUAL NDA');

    // 2. Main title & section headings
    expect(result.text).toContain('MASTER SERVICES AGREEMENT');
    expect(result.text).toContain('SECTION 2. INDEMNIFICATION AND LIABILITY LIMITS');

    // 3. Paragraph body text
    expect(result.text).toContain('entered into by and between Enterprise Inc and Vendor LLC');
    expect(result.text).toContain('indemnify and hold harmless the other against any third-party claims up to $1,000,000');

    // 4. Outer table cells
    expect(result.text).toContain('Deliverable Milestone');
    expect(result.text).toContain('Phase 1 Security Audit');
    expect(result.text).toContain('$2,500 per business day');

    // 5. Nested table cells
    expect(result.text).toContain('Nested Sub-task: Database Migration');
    expect(result.text).toContain('Requirement: Zero Data Loss');

    // 6. Footer text extraction (flagged bug resolved: mammoth ignores footer XML by default)
    expect(result.text).toContain('Governing Law: State of Delaware');
  });

  it('handles empty DOCX file gracefully with helpful error', async () => {
    const emptyZip = new JSZip();
    emptyZip.file(
      '[Content_Types].xml',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
    );
    emptyZip.file(
      'word/document.xml',
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>'
    );

    const emptyBuf = await emptyZip.generateAsync({ type: 'nodebuffer' });
    await expect(parseDocxBuffer(emptyBuf)).rejects.toThrow('No readable text content found in DOCX file.');
  });

  it('fails gracefully when given a corrupt or non-DOCX binary buffer', async () => {
    const corruptBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0xde, 0xad, 0xbe, 0xef]);
    await expect(parseDocxBuffer(corruptBuffer)).rejects.toThrow('Failed to parse DOCX document');
  });
});
