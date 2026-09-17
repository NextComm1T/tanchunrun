import {
  PERMISSION_LABEL,
  PERMISSION_TONE,
  type LocationPermission,
} from "../locationPermission";

/**
 * 현재 권한 상태 카드(디자인 L450-453).
 *
 * 값을 조회하지 않는다 — 넘겨받은 것만 그린다. 조회는 `LocationPermissionPanel` 이 한 번만
 * 하고, 이 카드와 아래 허용 버튼이 **같은 값**을 본다.
 */
export function PermissionStatusCard({
  loading,
  permission,
}: {
  loading: boolean;
  permission: LocationPermission;
}) {
  return (
    <div
      aria-busy={loading || undefined}
      className="flex items-center justify-between gap-3 rounded-2xl border-[1.5px] border-border bg-surface px-5 py-[18px] shadow-card"
    >
      <span className="text-base font-bold text-foreground">
        현재 권한 상태
      </span>

      {loading ? (
        <>
          {/* 값이 들어와도 줄 높이가 튀지 않도록 자리를 지킨다. */}
          <span
            aria-hidden="true"
            className="block h-[18px] w-14 animate-pulse rounded-full bg-surface-muted"
          />
          <span role="status" className="sr-only">
            위치 권한 상태를 확인하는 중이에요
          </span>
        </>
      ) : (
        <span
          className={`text-content font-extrabold ${PERMISSION_TONE[permission]}`}
        >
          {PERMISSION_LABEL[permission]}
        </span>
      )}
    </div>
  );
}
