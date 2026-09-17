import { SettingsBackButton } from "./SettingsBackButton";

/**
 * 설정 화면 전용 헤더(디자인 L375-380). 공용 `Header`(`backHref` 정적 문자열)를 쓰지
 * 않는다 — 뒤로가기 목적지가 client 저장소를 읽어야 정해져서 렌더 시점에 고정할 수 없다.
 * 레이아웃 값은 공용 `Header`와 동일하다(sticky · 테두리 · 20px 제목 · 40px 버튼).
 */
export function SettingsHeader() {
  return (
    <header className="sticky top-0 z-[5] flex items-center gap-3 border-b-[1.5px] border-surface-muted bg-background px-4 pt-[calc(4px+env(safe-area-inset-top))] pb-3.5">
      <SettingsBackButton />
      <h1 className="min-w-0 truncate text-title font-extrabold">설정</h1>
    </header>
  );
}
