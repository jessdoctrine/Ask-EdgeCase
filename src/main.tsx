import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Mode = "straight" | "evidence" | "challenge";
type Message = { id: string; role: "user" | "assistant"; content: string; mode?: Mode; time?: string };
type Conversation = { id: string; title: string; updatedAt: string; messages: Message[] };
type Attachment = { name: string; content: string };
type SpeechRecognitionResultEvent = Event & {
  results: { [index: number]: { [index: number]: { transcript: string } } };
};
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

const MAX_MESSAGE_LENGTH = 6000;
const STORAGE_KEY = "ask-edgecase-conversations";

const modeDetails: Record<Mode, { label: string; short: string; description: string }> = {
  straight: { label: "Straight Answer", short: "Direct & concise", description: "Direct, clear, and concise." },
  evidence: { label: "Evidence Check", short: "Facts & uncertainty", description: "Separates verified fact, inference, opinion, and uncertainty." },
  challenge: { label: "Challenge Me", short: "Pressure-test it", description: "Finds weak evidence and credible counterarguments." },
};

const seedMessages: Message[] = [
  {
    id: "welcome",
    role: "assistant",
    content: "I’m ready. Bring me a question, a claim, or an idea you want pressure-tested.",
    mode: "straight",
  },
];

function readConversations(): Conversation[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Conversation[]) : [];
  } catch {
    return [];
  }
}

function Icon({ name }: { name: "plus" | "menu" | "paperclip" | "mic" | "send" | "search" | "dots" | "spark" | "close" }) {
  const paths: Record<string, JSX.Element> = {
    plus: <><path d="M12 5v14M5 12h14" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    paperclip: <path d="m20.5 11.5-8.8 8.8a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.7 5.7l-9 9a2 2 0 0 1-2.8-2.8l8.3-8.3" />,
    mic: <><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" /><path d="M19 11a7 7 0 0 1-14 0M12 18v3M8 21h8" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    dots: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    spark: <><path d="m12 3-1.2 5.8L5 10l5.8 1.2L12 17l1.2-5.8L19 10l-5.8-1.2Z" /><path d="m19 16-.6 2.4L16 19l2.4.6L19 22l.6-2.4L22 19l-2.4-.6Z" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function App() {
  const [conversations, setConversations] = useState<Conversation[]>(readConversations);
  const [activeId, setActiveId] = useState("new");
  const [mode, setMode] = useState<Mode>("straight");
  const [noBs, setNoBs] = useState(false);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [isListening, setIsListening] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    const online = () => setIsOffline(false);
    const offline = () => setIsOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);

  const activeConversation = useMemo(() => conversations.find((item) => item.id === activeId), [activeId, conversations]);
  const messages = activeConversation?.messages ?? [];

  const startNewChat = () => {
    setActiveId("new");
    setDraft("");
    setError("");
    setAttachment(null);
    if (window.innerWidth < 800) setSidebarOpen(false);
  };

  const sendMessage = async () => {
    const attachedContext = attachment
      ? `\n\n[Attached file: ${attachment.name}]\n${attachment.content}`
      : "";
    const trimmed = `${draft.trim()}${attachedContext}`.trim();
    if (!trimmed || isLoading) return;
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      setError(`Keep your message under ${MAX_MESSAGE_LENGTH.toLocaleString()} characters.`);
      return;
    }
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: trimmed, mode };
    const current = activeConversation ?? { id: crypto.randomUUID(), title: trimmed.slice(0, 42), updatedAt: "Just now", messages: seedMessages };
    const nextMessages = [...current.messages, userMessage];
    setConversations((items) => [...items.filter((item) => item.id !== current.id), { ...current, messages: nextMessages, title: current.title === "New chat" ? trimmed.slice(0, 42) : current.title, updatedAt: "Just now" }]);
    setActiveId(current.id);
    setDraft("");
    setAttachment(null);
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          mode,
          noBs,
          conversation: [...current.messages, userMessage].slice(-20),
        }),
      });
      const result = (await response.json()) as { message?: string; error?: string };
      if (result.error === "MODEL_NOT_CONFIGURED") {
        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: result.message ?? "The conversation layer is not configured yet.",
          mode,
        };

        setConversations((items) => items.map((item) => item.id === current.id ? { ...item, messages: [...item.messages, assistantMessage] } : item));
        return;
      }
      if (!response.ok) {
        setError(result.message ?? "We couldn’t reach the conversation layer. Try again.");
        return;
      }
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.message ?? "The conversation layer did not return an answer.",
        mode,
      };
      setConversations((items) => items.map((item) => item.id === current.id ? { ...item, messages: [...item.messages, assistantMessage] } : item));
    } catch {
      setError(isOffline ? "You’re offline. Reconnect to send this question." : "We couldn’t reach the conversation layer. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 200_000) {
      setError("Files must be 200 KB or smaller for this prototype.");
      return;
    }
    if (!file.type.startsWith("text/") && !/\.(csv|json|md|txt|log)$/i.test(file.name)) {
      setError("Attach a text, CSV, JSON, Markdown, or log file.");
      return;
    }
    try {
      setAttachment({ name: file.name, content: await file.text() });
      setError("");
    } catch {
      setError("We couldn’t read that file. Try a plain-text file.");
    }
  };

  const toggleMicrophone = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognition = (window as SpeechRecognitionWindow).SpeechRecognition
      ?? (window as SpeechRecognitionWindow).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Voice input is not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) setDraft((current) => `${current}${current ? " " : ""}${transcript}`);
    };
    recognition.onerror = () => {
      setError("Microphone input was unavailable. Check browser permission and try again.");
      setIsListening(false);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };
    recognitionRef.current = recognition;
    setError("");
    setIsListening(true);
    recognition.start();
  };

  useEffect(() => () => recognitionRef.current?.stop(), []);

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <a className="brand" href="/" aria-label="Ask EdgeCase home"><span className="brand-mark">/</span><span>Ask <b>EdgeCase</b></span></a>
          <button className="icon-button sidebar-close" aria-label="Collapse sidebar" onClick={() => setSidebarOpen(false)}><Icon name="close" /></button>
        </div>
        <button className="new-chat" onClick={startNewChat}><Icon name="plus" /><span>New chat</span><kbd>⌘ K</kbd></button>
        <div className="history-heading"><span>Recent conversations</span><button className="icon-button" aria-label="Search conversations"><Icon name="search" /></button></div>
        <nav className="conversation-list" aria-label="Saved conversations">
          {conversations.length === 0 ? <p className="history-empty">Your conversations will show up here.</p> : conversations.slice().reverse().map((conversation) => (
            <button className={`conversation-item ${activeId === conversation.id ? "active" : ""}`} key={conversation.id} onClick={() => { setActiveId(conversation.id); if (window.innerWidth < 800) setSidebarOpen(false); }}>
              <span>{conversation.title || "Untitled chat"}</span><small>{conversation.updatedAt}</small>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer"><span className="status-dot" /> <span>Local prototype</span><button className="icon-button" aria-label="More options"><Icon name="dots" /></button></div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <button className="icon-button menu-button" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Icon name="menu" /></button>
          <div className="topbar-context"><span className="context-dot" /> <span>Ask EdgeCase</span><span className="context-divider">/</span><span className="context-muted">{activeConversation?.title ?? "New chat"}</span></div>
          <button className="icon-button" aria-label="Conversation options"><Icon name="dots" /></button>
        </header>

        <section className={`chat-stage ${messages.length === 0 ? "chat-empty" : ""}`} aria-live="polite">
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-mark"><Icon name="spark" /></div>
              <h1>What are you trying to figure out?</h1>
              <p>Direct answers. Real sources. No forced agreement. Ask directly and I’ll separate signal from noise when it matters.</p>
              <div className="prompt-examples">
                {["Is remote work actually more productive?", "Help me pressure-test this idea", "What should I verify before deciding?"].map((prompt) => <button key={prompt} onClick={() => setDraft(prompt)}>{prompt}<span>↗</span></button>)}
              </div>
            </div>
          ) : (
            <div className="message-stack">
              {messages.map((message) => <article className={`message ${message.role}`} key={message.id}>
                <div className="message-avatar">{message.role === "assistant" ? "/" : "You"}</div>
                <div className="message-body"><div className="message-meta"><strong>{message.role === "assistant" ? "EdgeCase" : "You"}</strong>{message.mode && <span className="mode-pill">{modeDetails[message.mode].label}</span>}</div><p>{message.content}</p>{message.role === "assistant" && message.content.includes("not configured") && <div className="notice notice-info"><span className="notice-icon">i</span><span>Connect a model provider in the server function to enable live answers. No key is stored in the browser.</span></div>}</div>
              </article>)}
              {isLoading && <div className="loading-row"><span className="loading-avatar">/</span><span className="typing"><i /><i /><i /></span><span>Thinking</span></div>}
            </div>
          )}
        </section>

        <div className="composer-wrap">
          {isOffline && <div className="notice notice-warning"><span className="notice-icon">!</span><span>You’re offline. Saved chats are still available locally.</span></div>}
          {error && <div className="notice notice-error" role="alert"><span className="notice-icon">!</span><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><Icon name="close" /></button></div>}
          <div className="mode-selector" role="radiogroup" aria-label="Answer mode">
            {(Object.keys(modeDetails) as Mode[]).map((item) => <button key={item} className={mode === item ? "selected" : ""} role="radio" aria-checked={mode === item} onClick={() => setMode(item)}><span className="radio-dot" />{modeDetails[item].label}</button>)}
            <label className={`toggle ${noBs ? "on" : ""}`}><input type="checkbox" checked={noBs} onChange={(event) => setNoBs(event.target.checked)} /><span className="toggle-track"><span /></span><span>No BS</span></label>
          </div>
          <form className="composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
            {attachment && <div className="attachment-chip"><Icon name="paperclip" /><span>{attachment.name}</span><button type="button" onClick={() => setAttachment(null)} aria-label={`Remove ${attachment.name}`}><Icon name="close" /></button></div>}
            <textarea value={draft} onChange={(event) => { setDraft(event.target.value); if (error) setError(""); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder="Ask anything worth thinking about..." aria-label="Message Ask EdgeCase" maxLength={MAX_MESSAGE_LENGTH} rows={1} />
            <div className="composer-actions"><input ref={fileInputRef} className="visually-hidden" type="file" accept=".txt,.md,.csv,.json,.log,text/plain,text/csv,application/json" onChange={(event) => void handleFileChange(event)} /><button type="button" className="icon-button" aria-label="Attach a text file" title="Attach a text file" onClick={() => fileInputRef.current?.click()}><Icon name="paperclip" /></button><button type="button" className={`icon-button ${isListening ? "listening" : ""}`} aria-label={isListening ? "Stop microphone" : "Use microphone"} title={isListening ? "Stop microphone" : "Use microphone"} onClick={toggleMicrophone}><Icon name="mic" /></button><span className="character-count">{draft.length + (attachment?.content.length ?? 0) > 0 ? `${draft.length + (attachment?.content.length ?? 0)}/${MAX_MESSAGE_LENGTH}` : "↵"}</span><button className="send-button" type="submit" aria-label="Send message" disabled={(!draft.trim() && !attachment) || isLoading}><Icon name="send" /></button></div>
          </form>
          <p className="composer-note">EdgeCase can be wrong. Verify important information with the sources.</p>
        </div>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
