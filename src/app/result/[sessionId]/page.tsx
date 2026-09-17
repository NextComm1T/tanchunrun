import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import otterMedal from "@assets/otter-medal.png";
import { AppShell } from "@/components/shared/AppShell";
import { NaverTancheonMap } from "@/components/shared/NaverTancheonMap";
import { TANCHEON_ZONE, type RoutePoint } from "@/domain/measure";
import { getViewer } from "@/server/auth/session";
import { getResult } from "@/server/runs/finish";

import { formatPace, formatRunDate, formatRunTime } from "./format";
import { ResultRecoveryGate } from "./ResultRecoveryGate";

/**
 * 러닝 결과 화면(#41 · #85, `탄천런.dc.html` L298-374).
 *
 * 정본에 헤더 · 뒤로 가기가 없다 — `AppShell` 만 쓰고 `Header` 는 넣지 않는다
 * (2026-09-14 결정 이력). 하단 탭바도 없는 화면이라 `bottom` 슬롯도 비운다.
 *
 * `getResult` 가 `active` · `finalization_pending` · `finalization_failed` 를 돌려주면
 * **여기서 판단을 끝내지 않는다** — `ResultRecoveryGate`(client) 가 이 기기의 로컬 종료
 * intent 유무까지 봐야 D14 의 recovery 규칙이 성립한다(P14).
 */
export default async function ResultPage({
  params,
}: PageProps<"/result/[sessionId]">) {
  const { sessionId } = await params;

  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const result = await getResult(sessionId, viewer.userId);

  // 타인 · 없는 id 를 구분하지 않는다(#85 AC) — 둘 다 같은 404 다.
  if (result.state === "not_found") notFound();

  if (result.state !== "saved") {
    return (
      <AppShell padded={false}>
        <ResultRecoveryGate
          userId={viewer.userId}
          sessionId={sessionId}
          serverState={result.state}
        />
      </AppShell>
    );
  }

  const { data } = result;

  const routePoints: RoutePoint[] = data.points.map((point) => ({
    trackerGeneration: point.trackerGeneration,
    rawSeq: point.rawSeq,
    ordinal: point.ordinal,
    kind: point.kind,
    segment: point.segment,
    lat: point.lat,
    lng: point.lng,
    recordedAt: point.recordedAt,
    inZone: point.inZone ?? false,
    excludedFromPrevReason: point.excludedFromPrevReason,
  }));

  const lastPoint = routePoints.at(-1);
  const endMarker = lastPoint
    ? {
        lat: lastPoint.lat,
        lng: lastPoint.lng,
        kind: "finished" as const,
        inZone: lastPoint.inZone,
      }
    : null;

  const totalDistKm = data.totalDistanceM / 1000;
  const tancheonDistKm = data.tancheonDistanceM / 1000;

  return (
    <AppShell padded={false}>
      <div className="flex items-start justify-between gap-2.5 px-5 pt-1.5 pb-3">
        <div>
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-success-soft px-[11px] py-[5px] text-label font-extrabold text-success">
              ✓ 완료
            </span>
            {data.pbFlags.map((label) => (
              <span
                key={label}
                className="rounded-full bg-primary-soft px-[11px] py-[5px] text-label font-extrabold text-primary-strong"
              >
                {label}
              </span>
            ))}
          </div>
          <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.5px]">
            {formatRunDate(data.runDate)}
          </h1>
          <p className="mt-[3px] text-content font-semibold text-muted">
            {data.nickname ?? "러너"}님, 오늘도 수고했어요!
          </p>
        </div>
        <Image
          src={otterMedal}
          alt="완주한 수달"
          className="h-[88px] w-[104px] shrink-0 rounded-md object-cover object-bottom"
        />
      </div>

      <div className="mx-5 shrink-0 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="h-[172px]">
          <NaverTancheonMap
            route={routePoints}
            marker={endMarker}
            zone={TANCHEON_ZONE}
            label="러닝 결과 지도"
          />
        </div>
        <div className="flex items-center gap-[18px] border-t border-surface-muted px-4 py-3">
          <div className="flex items-center gap-[7px]">
            <div className="h-1 w-[22px] rounded-full bg-primary" />
            <span className="text-label font-bold text-foreground">
              탄천 인정 구간
            </span>
          </div>
          <div className="flex items-center gap-[7px]">
            <div className="h-1 w-[22px] rounded-full bg-route-out" />
            <span className="text-label font-bold text-foreground">
              일반 러닝 구간
            </span>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 pt-3 pb-[30px]">
        {data.rankSnapshotKind === "ranked" ? (
          <div className="rounded-2xl bg-primary px-5 py-[18px] shadow-primary">
            <p className="mb-2 text-note font-bold text-white/85">
              탄천 랭킹 순위
            </p>
            <div className="flex items-end justify-between">
              <span className="text-[52px] font-extrabold tracking-[-2px] text-white leading-none">
                {data.rankSnapshot}위
              </span>
              <div className="text-right">
                <p className="m-0 text-[35px] font-extrabold text-white leading-none">
                  {tancheonDistKm.toFixed(2)} km
                </p>
                <p className="mt-[3px] text-label font-semibold text-white/80">
                  탄천 인정 거리 반영
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-surface-muted px-5 py-[18px]">
            <p className="mb-1 text-note font-extrabold text-muted">
              {data.rankSnapshotKind === "no_data"
                ? "아직 랭킹 데이터가 없습니다"
                : "랭킹 미반영"}
            </p>
            <p className="text-sm leading-[1.5] font-medium text-muted">
              {data.rankSnapshotKind === "no_data"
                ? "탄천 구역을 달리면 랭킹이 시작됩니다."
                : "탄천 구역 밖에서 달린 기록은 랭킹에 반영되지 않습니다."}
            </p>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <div className="grid grid-cols-2">
            <div className="border-b border-surface-muted px-5 py-[18px]">
              <p className="mb-1.5 text-label font-bold text-muted">총 거리</p>
              <p className="m-0 text-metric font-extrabold tracking-[-1px]">
                {totalDistKm.toFixed(2)}
                <span className="ml-1 text-sm font-semibold text-muted">
                  km
                </span>
              </p>
            </div>
            <div className="border-b border-l border-surface-muted px-5 py-[18px]">
              <p className="mb-1.5 text-label font-bold text-success">
                탄천 인정
              </p>
              <p className="m-0 text-metric font-extrabold tracking-[-1px] text-success">
                {tancheonDistKm.toFixed(2)}
                <span className="ml-1 text-sm font-semibold text-muted">
                  km
                </span>
              </p>
            </div>
            <div className="px-5 py-[18px]">
              <p className="mb-1.5 text-label font-bold text-muted">
                러닝 시간
              </p>
              <p className="m-0 text-metric font-extrabold tracking-[-1px]">
                {formatRunTime(data.durationSec)}
              </p>
            </div>
            <div className="border-l border-surface-muted px-5 py-[18px]">
              <p className="mb-1.5 text-label font-bold text-muted">페이스</p>
              <p className="m-0 text-metric font-extrabold tracking-[-1px]">
                {formatPace(data.avgPaceSecPerKm)}
                <span className="ml-1 text-sm font-semibold text-muted">
                  /km
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-3 pt-3">
          {data.rankSnapshotKind === "ranked" ? (
            <Link
              href="/ranking"
              className="flex h-[58px] w-full items-center justify-center rounded-xl bg-primary text-lg font-extrabold text-on-primary shadow-primary"
            >
              탄천 랭킹 보기
            </Link>
          ) : null}
          <Link
            href="/records"
            className="flex h-[58px] w-full items-center justify-center rounded-xl border border-border bg-surface text-lg font-extrabold text-foreground shadow-button-soft"
          >
            내 기록 보기
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
