// 개발용 자리표시 — 화면을 하나씩 구현하면서 지운다. 사용자용 문구가 아니다(원칙 3의 "예시 데이터"도 넣지 않는다).
export function ScreenPlaceholder({ title, spec, screenshot }: { title: string; spec: string; screenshot?: string }) {
  return (
    <main className="flex flex-1 flex-col gap-3 px-5 py-8">
      <h1 className="text-2xl font-bold text-text-primary">{title}</h1>
      <p className="rounded-card border border-dashed border-text-subtle/40 bg-surface p-4 text-sm text-text-secondary">
        개발 중인 화면이에요.
        <br />
        명세: <code className="text-xs">{spec}</code>
        {screenshot ? (
          <>
            <br />
            참고 화면: <code className="text-xs">web/screenshots/{screenshot}</code>
          </>
        ) : null}
      </p>
    </main>
  );
}
