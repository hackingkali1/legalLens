import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { DocumentChunk } from '@/types/document';
import { ChatMessage } from '@/types/chat';
import { LEGAL_DISCLAIMER } from '@/lib/constants';

describe('Flow 4: Document Q&A Chat Streaming & Citation Highlighting', () => {
  let originalFetch: typeof global.fetch;

  const mockChunks: DocumentChunk[] = [
    {
      chunkId: 'chunk-1',
      sectionId: 'sec-1',
      sectionTitle: 'SECTION 4: TERMINATION',
      text: 'Either party may terminate this Agreement by giving thirty (30) days prior written notice to the other party.',
      tokenEstimate: 25,
      charStart: 0,
      charEnd: 110,
    },
    {
      chunkId: 'chunk-2',
      sectionId: 'sec-2',
      sectionTitle: 'SECTION 9: GOVERNING LAW',
      text: 'This Agreement shall be construed in accordance with the laws of the State of Delaware.',
      tokenEstimate: 18,
      charStart: 111,
      charEnd: 198,
    },
  ];

  const rawText = mockChunks.map((c) => c.text).join('\n\n');

  beforeEach(() => {
    originalFetch = global.fetch;
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('submitting a question triggers chat request and renders response with citations', async () => {
    const mockAnswer: ChatMessage = {
      id: 'resp-1',
      sender: 'assistant',
      text: 'According to Section 4, either party may terminate by providing 30 days prior written notice.',
      citations: [
        {
          sectionId: 'sec-1',
          sectionTitle: 'SECTION 4: TERMINATION',
          quote: 'Either party may terminate this Agreement by giving thirty (30) days prior written notice',
          relevanceExplanation: 'Specifies the 30-day termination notice requirement.',
        },
      ],
      timestamp: new Date().toISOString(),
      disclaimer: 'Not legal advice',
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockAnswer,
    });
    global.fetch = fetchMock;

    render(
      <ChatInterface
        chunks={mockChunks}
        rawText={rawText}
        onJumpToCitation={vi.fn()}
      />
    );

    // Initial welcome message should be visible
    expect(
      screen.getByText(/Hello! I am your LegalLens assistant/i)
    ).toBeDefined();

    // Type a question in the input
    const input = screen.getByPlaceholderText(/ask anything about obligations/i);
    fireEvent.change(input, {
      target: { value: 'How much notice is needed to terminate?' },
    });

    const sendBtn = screen.getByRole('button', { name: /send question/i });
    fireEvent.click(sendBtn);

    // Assert user message is rendered immediately
    expect(
      screen.getByText('How much notice is needed to terminate?')
    ).toBeDefined();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/chat');
    const sentBody = JSON.parse(options.body as string);
    expect(sentBody.question).toBe('How much notice is needed to terminate?');
    expect(sentBody.chunks).toHaveLength(2);
    expect(sentBody.rawText).toContain('Either party may terminate');

    // Assert assistant response and source citation are rendered
    await waitFor(() => {
      expect(
        screen.getByText(
          'According to Section 4, either party may terminate by providing 30 days prior written notice.'
        )
      ).toBeDefined();
      expect(screen.getByText('Source Citations:')).toBeDefined();
      expect(screen.getByText('SECTION 4: TERMINATION')).toBeDefined();
    });
  });

  it('handles empty and unanswerable queries gracefully with clear out-of-scope response', async () => {
    const outOfScopeAnswer: ChatMessage = {
      id: 'resp-oos',
      sender: 'assistant',
      text: "I couldn't find that information in the uploaded document.",
      citations: [],
      timestamp: new Date().toISOString(),
      isOutOfScope: true,
      disclaimer: 'Not legal advice',
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => outOfScopeAnswer,
    });
    global.fetch = fetchMock;

    render(
      <ChatInterface
        chunks={mockChunks}
        rawText={rawText}
      />
    );

    const input = screen.getByPlaceholderText(/ask anything about obligations/i);
    const sendBtn = screen.getByRole('button', { name: /send question/i });

    // 1. Whitespace or empty input does NOT dispatch request
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(sendBtn);
    expect(fetchMock).not.toHaveBeenCalled();

    // 2. Unanswerable query
    fireEvent.change(input, {
      target: { value: 'What was Apple Inc stock price yesterday?' },
    });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // 3. Assert clear "couldn't find that in the document" response without crashing
    await waitFor(() => {
      expect(
        screen.getByText(
          "I couldn't find that information in the uploaded document."
        )
      ).toBeDefined();
    });

    // Assert no citations rendered
    expect(screen.queryByText('Source Citations:')).toBeNull();
  });

  it('clicking a citation pill triggers onJumpToCitation with correct section and quote', async () => {
    const onJumpToCitation = vi.fn();

    const mockAnswerWithCitation: ChatMessage = {
      id: 'resp-citation-test',
      sender: 'assistant',
      text: 'Delaware law governs this contract.',
      citations: [
        {
          sectionId: 'sec-2',
          sectionTitle: 'SECTION 9: GOVERNING LAW',
          quote: 'This Agreement shall be construed in accordance with the laws of the State of Delaware.',
          relevanceExplanation: 'Governing jurisdiction clause.',
        },
      ],
      timestamp: new Date().toISOString(),
      disclaimer: 'Not legal advice',
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockAnswerWithCitation,
    });
    global.fetch = fetchMock;

    render(
      <ChatInterface
        chunks={mockChunks}
        rawText={rawText}
        onJumpToCitation={onJumpToCitation}
      />
    );

    const input = screen.getByPlaceholderText(/ask anything about obligations/i);
    fireEvent.change(input, { target: { value: 'Which state law governs?' } });
    fireEvent.click(screen.getByRole('button', { name: /send question/i }));

    // Wait for citation pill to appear
    await waitFor(() => {
      expect(screen.getByText('SECTION 9: GOVERNING LAW')).toBeDefined();
    });

    // Click citation pill button
    const citationBtn = screen.getByRole('button', {
      name: /SECTION 9: GOVERNING LAW/i,
    });
    fireEvent.click(citationBtn);

    // Verify onJumpToCitation was invoked with correct arguments
    expect(onJumpToCitation).toHaveBeenCalledTimes(1);
    expect(onJumpToCitation).toHaveBeenCalledWith(
      'SECTION 9: GOVERNING LAW',
      'This Agreement shall be construed in accordance with the laws of the State of Delaware.'
    );
  });

  it('clicking a suggested question submits it directly', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'resp-sug',
        sender: 'assistant',
        text: 'This agreement does not contain an automatic renewal clause.',
        citations: [],
        timestamp: new Date().toISOString(),
      }),
    });
    global.fetch = fetchMock;

    render(
      <ChatInterface
        chunks={mockChunks}
        rawText={rawText}
        suggestedQuestions={['Does this agreement automatically renew?']}
      />
    );

    const suggestedBtn = screen.getByRole('button', {
      name: 'Does this agreement automatically renew?',
    });
    fireEvent.click(suggestedBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [, options] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse(options.body as string);
    expect(sentBody.question).toBe('Does this agreement automatically renew?');
  });

  it('handles API error responses gracefully without crashing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'Something went wrong answering your question — please try again.',
      }),
    });
    global.fetch = fetchMock;

    render(
      <ChatInterface
        chunks={mockChunks}
        rawText={rawText}
      />
    );

    const input = screen.getByPlaceholderText(/ask anything about obligations/i);
    fireEvent.change(input, { target: { value: 'Will this fail?' } });
    fireEvent.click(screen.getByRole('button', { name: /send question/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Error: Something went wrong answering your question/i)
      ).toBeDefined();
    });
  });

  it('renders the legal disclaimer beneath each AI response bubble', async () => {
    const customDisclaimer = 'Custom legal disclaimer: Consult a licensed attorney.';
    const mockAnswer: ChatMessage = {
      id: 'resp-disclaimer-test',
      sender: 'assistant',
      text: 'Here is the answer to your question regarding liability limits.',
      citations: [],
      timestamp: new Date().toISOString(),
      disclaimer: customDisclaimer,
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockAnswer,
    });
    global.fetch = fetchMock;

    render(
      <ChatInterface
        chunks={mockChunks}
        rawText={rawText}
      />
    );

    // Initial welcome message bubble must include the default legal disclaimer
    expect(screen.getByText(LEGAL_DISCLAIMER)).toBeDefined();

    // Send a question to get an AI reply
    const input = screen.getByPlaceholderText(/ask anything about obligations/i);
    fireEvent.change(input, { target: { value: 'What is the liability cap?' } });
    fireEvent.click(screen.getByRole('button', { name: /send question/i }));

    // User message bubble should NOT have a disclaimer
    const userMessage = screen.getByText('What is the liability cap?');
    expect(userMessage.closest('div')?.textContent).not.toContain(customDisclaimer);

    // AI response bubble must render its disclaimer
    await waitFor(() => {
      expect(screen.getByText(customDisclaimer)).toBeDefined();
    });

    // Both assistant bubbles (welcome + reply) render legal disclaimer notes
    const disclaimerNotes = screen.getAllByRole('note', { name: /legal disclaimer/i });
    expect(disclaimerNotes.length).toBeGreaterThanOrEqual(2);
  });
});
