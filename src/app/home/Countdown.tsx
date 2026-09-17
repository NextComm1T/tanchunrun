/**
 * 러닝 시작 전 3초 카운트다운(디자인 L199-206 · L1307-1309).
 *
 * 별도 route 가 아니라 홈 화면 안의 상태다. 정본에서 화면 전체를 채우고 탭바가
 * 없으며, 취소 버튼도 없다(이슈 #42 결정 이력 — 정본에 취소 UI 가 없다).
 */
export function Countdown({ count }: { count: number }) {
  const isGo = count <= 0;

  return (
    <div
      // 남은 초가 바뀔 때마다 스크린리더도 읽어야 한다. "준비하세요!" 는 바뀌지
      // 않으므로 다시 읽히지 않는다.
      aria-live="assertive"
      className="flex flex-1 flex-col items-center justify-center gap-4 bg-background"
    >
      <p className="text-button font-bold text-muted">준비하세요!</p>

      <p
        className={`leading-none font-extrabold tracking-[-4px] text-primary ${
          isGo ? "text-[68px]" : "text-[132px]"
        }`}
      >
        {isGo ? "GO!" : count}
      </p>

      <p className="text-base font-semibold text-muted">
        {isGo ? "탄천을 달려요!" : `${count}초 후 시작합니다`}
      </p>
    </div>
  );
}
