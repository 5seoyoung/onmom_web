"use client";

// AI 상담 — ChatView.swift를 옮긴 화면(01 §3-11, chat.png).
// 서버(LLM)가 설정돼 있으면 patient_edu 프리셋으로 묻고, 미설정·실패면 앱 내 규칙 안내(폴백)로 답하며 그 사실을 배너로 알린다.
// 서버에 처음 묻기 전에 AI 국외 이전 동의를 받는다(aiConsent.ts) — 첫 질문을 보내면 동의 카드가 뜨고,
// [동의하고 계속하기]면 그 질문을 AI에, [동의하지 않기]면 앱 내 안내로 답한다. 동의 전에는 서버에 아무것도 보내지 않는다.
// 음성 입력은 웹에서 만들지 않는다(결정 D3). 대화는 이 화면 메모리에만 둔다(저장하지 않음).
// 정보 제공·안내만 한다. 진단·처방이 아니다.
// 온맘 말풍선 아래에 어디서 온 답인지 작은 글씨로 남긴다(앱 안내 / AI 답변 · 진단·처방이 아닙니다 — chatModel CHAT_ORIGIN_CAPTION).
// 앱 안내로 답한 이유(미연결·동의 안 함·한도·혼잡·거절 — chatModel ChatFallbackReason)에 맞게 배너 첫머리를 바꾼다.
// 앱 안내 말풍선의 전화번호(1577-0199 · 109 · 119)는 tel: 링크(PhoneLinks). AI 답은 plain text만(지어낸 번호가 링크가 되지 않게).
// PC(lg 이상): 머리·배너·대화·입력창을 같은 기둥에 맞춘다 — 다른 읽기 화면과 같은 폭(최대 48rem)·같은 왼쪽 선·같은 위 여백
// (components/shell/pageFrame.ts). 가운데 정렬하지 않는다. 사이드바에 있는 화면이라 PC에서는 [뒤로]를 숨긴다.
// 스크롤 영역은 전체 폭이라 스크롤 막대는 가장자리에 있다. 폰 기둥(30rem)에서는 기둥이 곧 화면 폭이라 그대로다.

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Info, LoaderCircle } from "lucide-react";
import { LLM_FUNCTION_MAX_MESSAGE_CHARS, llmComplete } from "@/api/llm";
import { PAGE_EDGE_TOP, PAGE_EDGE_X, READING_WIDTH } from "@/components/shell/pageFrame";
import { SubPageHeader, cx } from "@/components/ui";
import { isLLMBackendConfigured } from "@/config";
import { PhoneLinks } from "@/features/guide/PhoneLinks";
import { CHAT_FAQ, CHAT_FAQ_TITLE } from "@/rules/chat";
import { useAppStore } from "@/store/useAppStore";
import { AiConsentCard } from "./AiConsentCard";
import { aiMode, useAiConsent } from "./aiConsent";
import {
  CHAT_ORIGIN_CAPTION,
  canSendChat,
  chatBackHref,
  chatBannerText,
  chatLlmContext,
  chatSendAction,
  chatScreenState,
  initialChatMessages,
  normalizeChatDraft,
  requestChatReply,
  shouldSendOnEnter,
  type ChatBubbleMessage,
  type ChatFallbackReason,
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

/** 대화 기둥 — 머리·배너·말풍선·입력창이 같은 폭. PC는 읽기 화면 폭(최대 48rem), 왼쪽 정렬 */
const CHAT_COLUMN = cx("w-full", READING_WIDTH);

export function ChatScreen() {
  const { hydrated, state, account } = useAppStore();
  const { consented, accept } = useAiConsent(account?.id ?? null);
  /** 이번 방문에 AI 국외 이전 동의를 거절했다 — 이 화면을 떠나면 다음에 다시 묻는다 */
  const [declined, setDeclined] = useState(false);
  const mode = aiMode({ aiAvailable: isLLMBackendConfigured(), consented, declined });
  /** 서버에 물을 수 있는가(동의를 묻는 중 포함) — 입력 상한이 이 값을 본다. 배너·FAQ는 mode로 정한다(chatScreenState) */
  const llmConfigured = mode !== "off";

  const [messages, setMessages] = useState<ChatBubbleMessage[]>(initialChatMessages);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  /** 마지막 답이 규칙 폴백이었는가 — 아직 답이 없으면 null(서버 미설정이면 처음부터 배너) */
  const [lastReplyFromFallback, setLastReplyFromFallback] = useState<boolean | null>(null);
  /** 마지막 폴백의 이유(배너 첫머리) — 아직 폴백 답이 없으면 null */
  const [fallbackReason, setFallbackReason] = useState<ChatFallbackReason | null>(null);
  /** 동의를 기다리는 대화 — 첫 질문을 보냈는데 아직 AI 국외 이전 동의를 고르지 않았다 */
  const [awaitingConsent, setAwaitingConsent] = useState<ChatBubbleMessage[] | null>(null);

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
    mode,
    messageCount: messages.length,
    thinking,
    lastReplyFromFallback,
  });
  const busy = thinking || awaitingConsent !== null;
  const canSend = canSendChat({ draft, thinking: busy, hydrated });

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
  }, [messages.length, thinking, awaitingConsent]);

  function send(raw: string) {
    const text = normalizeChatDraft(raw);
    if (!canSendChat({ draft: text, thinking: busy, hydrated }) || inflight.current) return;

    const history: ChatBubbleMessage[] = [...messages, { id: nextId.current++, role: "user", text }];
    setMessages(history);
    setDraft("");
    const action = chatSendAction(mode, text);
    // 아직 동의를 고르지 않았다 — 서버에 보내지 않고 동의 카드를 띄운다(위기 표현이면 기다리게 하지 않고 바로 앱 안내)
    if (action === "consent") {
      setAwaitingConsent(history);
      return;
    }
    requestAnswer(history, action === "ai", declined);
  }

  /**
   * 답 구하기 — useAi면 서버(LLM)에 묻고, 아니면 앱 내 안내(규칙 폴백)로 답한다.
   * declinedNow: 이번에 AI 국외 이전에 동의하지 않았다(거절 직후에는 state가 아직 바뀌지 않았으므로 값으로 받는다).
   */
  function requestAnswer(history: ChatBubbleMessage[], useAi: boolean, declinedNow: boolean) {
    setThinking(true);
    const controller = new AbortController();
    inflight.current = controller;

    void requestChatReply(history, {
      llmConfigured: useAi,
      complete: llmComplete,
      // 서버에 함께 보내는 산모 정보 — 산후 주차·분만 방식·수유 여부만(서버에 물을 때만 쓰인다)
      context: useAi ? chatLlmContext(state.profile, new Date()) : null,
      signal: controller.signal,
      declined: declinedNow,
    }).then((reply) => {
      if (controller.signal.aborted) return;
      inflight.current = null;
      setThinking(false);
      // 위기 안내는 AI 연결 여부와 무관한 고정 답이다 — 배너("AI 서버에 연결되지 않아")를 새로 띄우거나 내리지 않는다
      if (!reply.crisis) {
        setLastReplyFromFallback(reply.fromFallback);
        setFallbackReason(reply.fallbackReason);
      }
      setMessages((prev) => [...prev, { id: nextId.current++, role: "assistant", text: reply.text, origin: reply.origin }]);
    });
  }

  function onAcceptAi() {
    accept();
    const history = awaitingConsent;
    setAwaitingConsent(null);
    if (history) requestAnswer(history, true, false);
    inputRef.current?.focus({ preventScroll: true });
  }

  function onDeclineAi() {
    setDeclined(true);
    const history = awaitingConsent;
    setAwaitingConsent(null);
    if (history) requestAnswer(history, false, true);
    inputRef.current?.focus({ preventScroll: true });
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
    <main className="@container flex h-dvh flex-col">
      <div className={cx(CHAT_COLUMN, "px-6 pt-2", PAGE_EDGE_TOP)}>
        <SubPageHeader title={TITLE} backHref={backHref} hideBackWithSidebar />
      </div>

      {/* 첫머리는 이유에 맞게 — 미설정이면 원문("연결되지 않아"), 이번에 AI 동의를 거절했으면 "동의하지 않아", 한도·혼잡·거절은 서버 답에 따라 */}
      {showBanner ? <FallbackNotice text={chatBannerText(fallbackReason ?? (declined ? "declined" : "notConnected"))} /> : null}

      <div ref={logRef} className="flex-1 overflow-y-auto">
        <div className={cx(CHAT_COLUMN, "p-4", PAGE_EDGE_X)}>
          {/* role="log": 새 말풍선을 화면 낭독기가 차례로 읽는다 */}
          <div role="log">
            <ol className="flex flex-col gap-2">
              {messages.map((m) => (
                <ChatBubble key={m.id} message={m} />
              ))}
            </ol>
          </div>

          {/* 자주 묻는 질문은 AI가 답할 때(동의한 뒤)만(ChatView.swift:31-36) — 규칙 폴백은 FAQ 대부분에 엉뚱한 답을 준다 */}
          {showFaq ? (
            <section aria-labelledby="chat-faq-title" className="flex flex-col gap-1 pt-2">
              <h2 id="chat-faq-title" className="pl-1 text-xs font-medium text-text-subtle-aa">
                {CHAT_FAQ_TITLE}
              </h2>
              <ul className="flex flex-wrap gap-2">
                {CHAT_FAQ.map((q) => (
                  <li key={q} className="flex">
                    <button
                      type="button"
                      onClick={() => send(q)}
                      disabled={!hydrated}
                      className="min-h-11 rounded-full bg-coral-tint px-3 py-2 text-left text-[0.8125rem] font-medium text-primary-text"
                    >
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {awaitingConsent ? (
            <div className="pt-3">
              <AiConsentCard onAccept={onAcceptAi} onDecline={onDeclineAi} focusOnMount />
            </div>
          ) : null}

          {thinking ? (
            <div role="status" className="flex pl-4 pt-2">
              <LoaderCircle aria-hidden className="size-5 text-primary motion-safe:animate-spin" />
              <span className="sr-only">{THINKING_SR_LABEL}</span>
            </div>
          ) : null}
        </div>
      </div>

      <form
        onSubmit={onSubmit}
        className={cx(CHAT_COLUMN, "flex items-end gap-2 bg-background px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]", PAGE_EDGE_X)}
      >
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          // 서버(Edge Function chat)가 받는 한 메시지 상한 — 넘으면 요청을 보내지 못하고 "연결되지 않아" 답이 나간다.
          // UTF-16 길이 ≥ 글자(코드 포인트) 수라 이 상한 안이면 함수의 글자 수 검사도 통과한다. AI를 쓰지 않는 빌드는 그대로.
          maxLength={llmConfigured ? LLM_FUNCTION_MAX_MESSAGE_CHARS : undefined}
          placeholder={INPUT_PLACEHOLDER}
          aria-label={INPUT_PLACEHOLDER}
          enterKeyHint="send"
          autoComplete="off"
          className="max-h-32 min-h-11 flex-1 resize-none rounded-[1.375rem] bg-surface px-4 py-2.5 text-base leading-6 text-text-primary placeholder:text-text-subtle-aa [field-sizing:content]"
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

// 서버 대신 앱 내 안내로 답하고 있음 — "AI가 답한 것처럼" 보이지 않게(ChatView.swift:61-74).
// 문구: content.json disclaimers.chat_banner — 첫머리만 이유에 따라(chatModel chatBannerText)
function FallbackNotice({ text }: { text: string }) {
  return (
    // 폰: 화면 폭 띠 / 넓은 화면: 대화 기둥 폭의 둥근 안내 상자.
    // PC(lg)는 제목·말풍선과 같은 왼쪽 선에 두고(바깥 여백), 제목과의 간격을 다른 화면의 머리 → 첫 카드 간격과 같게 한다.
    <div className={cx(CHAT_COLUMN, PAGE_EDGE_X, "lg:pt-4")}>
      <div role="status" className="flex items-start gap-1.5 bg-state-watch/10 px-4 py-2 @3xl:rounded-button">
        <Info aria-hidden className="mt-0.75 size-3.5 shrink-0 fill-state-watch text-white" />
        <p className="min-w-0 text-[0.8125rem] text-text-secondary">{text}</p>
      </div>
    </div>
  );
}

// 말풍선 — 16 · 라운드 18 · 좌우 16 위아래 8, 사용자는 오른쪽 primary/흰 글씨, 온맘은 왼쪽 surface(ChatView.swift:199-219).
// 온맘 말풍선 아래 12px 표시(앱 안내 / AI 답변 …) — 인사말에는 없다. 웹 신규(iOS는 배너만 — ChatView.swift:61-74).
// 테스트(chatMarkup.test.ts)가 따로 그려 본다 — AI 답에 전화 링크가 생기지 않는지, 앱 안내의 안전 연계 번호가 링크인지.
export function ChatBubble({ message }: { message: ChatBubbleMessage }) {
  const isUser = message.role === "user";
  const caption = !isUser && message.origin ? CHAT_ORIGIN_CAPTION[message.origin] : null;
  return (
    <li className={cx("flex flex-col gap-1", isUser ? "items-end pl-10" : "items-start pr-10")}>
      {/* LLM 답은 신뢰할 수 없는 값 — plain text로만 렌더(마크다운·HTML 금지, 검수 #51). 전화 링크는 앱 안내(rules)에만 */}
      <p
        className={cx(
          "whitespace-pre-wrap rounded-[1.125rem] px-4 py-2 text-base",
          isUser ? "bg-primary text-white" : "bg-surface text-text-primary",
        )}
      >
        <span className="sr-only">{SPEAKER_SR_LABEL[message.role]}</span>
        {message.origin === "rules" ? <PhoneLinks text={message.text} /> : message.text}
      </p>
      {caption !== null ? <p className="px-2 text-xs text-text-subtle-aa">{caption}</p> : null}
    </li>
  );
}
