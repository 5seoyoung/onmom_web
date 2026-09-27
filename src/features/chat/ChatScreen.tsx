"use client";

// AI 상담 — ChatView.swift를 옮긴 화면(01 §3-11, chat.png).
// 서버(LLM)가 설정돼 있으면 patient_edu 프리셋으로 묻고, 미설정·실패면 앱 내 규칙 안내(폴백)로 답하며 그 사실을 배너로 알린다.
// 음성 입력은 웹에서 만들지 않는다(결정 D3). 대화는 이 화면 메모리에만 둔다(저장하지 않음).
// 정보 제공·안내만 한다. 진단·처방이 아니다.

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Info, LoaderCircle } from "lucide-react";
import { llmComplete } from "@/api/llm";
import { SubPageHeader, cx } from "@/components/ui";
import { isLLMBackendConfigured } from "@/config";
import { buildChatContext, CHAT_FALLBACK_BANNER, CHAT_FAQ, CHAT_FAQ_TITLE } from "@/rules/chat";
import { useAppStore } from "@/store/useAppStore";
import {
  canSendChat,
  chatBackHref,
  chatScreenState,
  initialChatMessages,
  normalizeChatDraft,
  requestChatReply,
  shouldSendOnEnter,
  type ChatBubbleMessage,
} from "./chatModel";

// 원문: ChatView.swift:51
const TITLE = "AI 상담";
// 원문: ChatView.swift:90
const INPUT_PLACEHOLDER = "메시지를 입력하세요";
// 원문: ChatView.swift:102
const SEND_LABEL = "메시지 보내기";
// 웹 신규 문구 — CPO 확인 필요 (말풍선 앞에 화면 낭독용으로만 붙는 화자 표시. 화면에는 보이지 않는다)
const SPEAKER_SR_LABEL = { user: "나: ", assistant: "온맘: " } as const;
// 웹 신규 문구 — CPO 확인 필요 (답을 기다리는 동안 스피너의 화면 낭독용 이름. 화면에는 보이지 않는다)
const THINKING_SR_LABEL = "답변을 준비하고 있어요";

const noopSubscribe = () => () => {};

export function ChatScreen() {
  const { hydrated, state } = useAppStore();
  const llmConfigured = isLLMBackendConfigured();

  const [messages, setMessages] = useState<ChatBubbleMessage[]>(initialChatMessages);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  /** 마지막 답이 규칙 폴백이었는가 — 아직 답이 없으면 null(서버 미설정이면 처음부터 배너) */
  const [lastReplyFromFallback, setLastReplyFromFallback] = useState<boolean | null>(null);

  const nextId = useRef(1);
  const inflight = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 홈에서 열었으면 뒤로 = 홈. 정적 HTML에서는 주소를 모르므로 프로필로 두었다가 브라우저에서 읽는다.
  const backHref = useSyncExternalStore(
    noopSubscribe,
    () => chatBackHref(window.location.search),
    () => chatBackHref(""),
  );

  const { showBanner, showFaq } = chatScreenState({
    llmConfigured,
    messageCount: messages.length,
    thinking,
    lastReplyFromFallback,
  });
  const canSend = canSendChat({ draft, thinking, hydrated });

  // 화면을 떠나면 진행 중인 서버 요청을 끊는다(늦게 온 답은 버린다).
  useEffect(() => {
    return () => inflight.current?.abort();
  }, []);

  // 새 말풍선·대기 표시가 생기면 맨 아래로(ChatView.swift:44-46).
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [messages.length, thinking]);

  function send(raw: string) {
    const text = normalizeChatDraft(raw);
    if (!canSendChat({ draft: text, thinking, hydrated }) || inflight.current) return;

    const history: ChatBubbleMessage[] = [...messages, { id: nextId.current++, role: "user", text }];
    setMessages(history);
    setDraft("");
    setThinking(true);

    const controller = new AbortController();
    inflight.current = controller;
    // 서버에 함께 보내는 산모 컨텍스트(ChatView.swift:188-196) — 서버가 설정돼 있을 때만 쓰인다.
    const context = buildChatContext({ profile: state.profile, symptomHistory: state.symptomHistory, now: new Date() });

    void requestChatReply(history, {
      llmConfigured,
      complete: llmComplete,
      context,
      signal: controller.signal,
    }).then((reply) => {
      if (controller.signal.aborted) return;
      inflight.current = null;
      setThinking(false);
      setLastReplyFromFallback(reply.fromFallback);
      setMessages((prev) => [...prev, { id: nextId.current++, role: "assistant", text: reply.text }]);
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    send(draft);
    // 입력창에서 보냈으면 입력창에 그대로 머문다(ChatView.swift:97-103은 키보드를 닫지 않는다).
    // 키보드로 보내기 버튼을 눌렀을 때도 버튼이 곧 비활성이 되므로 자리를 잃지 않게 입력창으로 돌려놓는다.
    inputRef.current?.focus({ preventScroll: true });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      shouldSendOnEnter({
        key: event.key,
        shiftKey: event.shiftKey,
        isComposing: event.nativeEvent.isComposing,
        keyCode: event.keyCode,
      })
    ) {
      event.preventDefault();
      send(draft);
    }
  }

  return (
    <main className="flex h-dvh flex-col">
      <div className="px-6 pt-2">
        <SubPageHeader title={TITLE} backHref={backHref} />
      </div>

      {showBanner ? <FallbackNotice /> : null}

      <div ref={logRef} className="flex-1 overflow-y-auto p-4">
        {/* role="log": 새 말풍선을 화면 낭독기가 차례로 읽는다 */}
        <div role="log">
          <ol className="flex flex-col gap-2">
            {messages.map((m) => (
              <ChatBubble key={m.id} message={m} />
            ))}
          </ol>
        </div>

        {/* 자주 묻는 질문은 서버가 답할 수 있을 때만(ChatView.swift:31-36) — 규칙 폴백은 FAQ 대부분에 엉뚱한 답을 준다 */}
        {showFaq ? (
          <section aria-labelledby="chat-faq-title" className="flex flex-col gap-1 pt-2">
            <h2 id="chat-faq-title" className="pl-1 text-xs font-medium text-text-subtle">
              {CHAT_FAQ_TITLE}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {CHAT_FAQ.map((q) => (
                <li key={q} className="flex">
                  <button
                    type="button"
                    onClick={() => send(q)}
                    disabled={!hydrated}
                    className="min-h-11 rounded-full bg-coral-tint px-3 py-2 text-left text-[0.8125rem] font-medium text-primary"
                  >
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {thinking ? (
          <div role="status" className="flex pl-4 pt-2">
            <LoaderCircle aria-hidden className="size-5 text-primary motion-safe:animate-spin" />
            <span className="sr-only">{THINKING_SR_LABEL}</span>
          </div>
        ) : null}
      </div>

      <form
        onSubmit={onSubmit}
        className="flex items-end gap-2 bg-background px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={INPUT_PLACEHOLDER}
          aria-label={INPUT_PLACEHOLDER}
          enterKeyHint="send"
          autoComplete="off"
          className="max-h-32 min-h-11 flex-1 resize-none rounded-[1.375rem] bg-surface px-4 py-2.5 text-base leading-6 text-text-primary placeholder:text-text-subtle [field-sizing:content]"
        />
        <button
          type="submit"
          aria-label={SEND_LABEL}
          disabled={!canSend}
          // 마우스·터치로 눌러도 입력창의 포커스를 빼앗지 않는다 — 모바일에서 보낼 때마다 키보드가 닫히지 않게
          onMouseDown={(e) => e.preventDefault()}
          className="group flex size-11 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-white group-disabled:bg-divider">
            <ArrowUp aria-hidden className="size-5" strokeWidth={2.75} />
          </span>
        </button>
      </form>
    </main>
  );
}

// 서버 대신 앱 내 안내로 답하고 있음 — "AI가 답한 것처럼" 보이지 않게(ChatView.swift:61-74). 문구: content.json disclaimers.chat_banner
function FallbackNotice() {
  return (
    <div role="status" className="flex items-start gap-1.5 bg-state-watch/10 px-4 py-2">
      <Info aria-hidden className="mt-0.75 size-3.5 shrink-0 fill-state-watch text-white" />
      <p className="min-w-0 text-[0.8125rem] text-text-secondary">{CHAT_FALLBACK_BANNER}</p>
    </div>
  );
}

// 말풍선 — 16 · 라운드 18 · 좌우 16 위아래 8, 사용자는 오른쪽 primary/흰 글씨, 온맘은 왼쪽 surface(ChatView.swift:199-219)
function ChatBubble({ message }: { message: ChatBubbleMessage }) {
  const isUser = message.role === "user";
  return (
    <li className={cx("flex", isUser ? "justify-end pl-10" : "justify-start pr-10")}>
      {/* LLM 답은 신뢰할 수 없는 값 — plain text로만 렌더(마크다운·HTML 금지, 검수 #51) */}
      <p
        className={cx(
          "whitespace-pre-wrap rounded-[1.125rem] px-4 py-2 text-base",
          isUser ? "bg-primary text-white" : "bg-surface text-text-primary",
        )}
      >
        <span className="sr-only">{SPEAKER_SR_LABEL[message.role]}</span>
        {message.text}
      </p>
    </li>
  );
}
