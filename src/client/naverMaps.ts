/**
 * NAVER Maps JavaScript API v3(Web Dynamic Map) 로더 — #84 · #78 D3-B.
 *
 * **왜 `src/client` 인가** — `src/client/tracker.ts` 와 같은 이유다. 브라우저 전용이고
 * 홈(#84) · 러닝(#83) · 결과(#85) · 기록 상세(#86) 네 화면이 함께 쓸 모듈이라 어느 한 화면
 * 폴더에 넣을 수 없다. `src/domain` 은 framework 중립 순수 계산이고 `src/server` 는
 * server-only 라 둘 다 아니다(D12).
 *
 * **`layout.tsx` 에 `<script>` 를 넣지 않는다**(#84 공용 파일 영향 표). 지도를 쓰지 않는
 * 화면까지 SDK 를 받게 되고, layout 은 전원이 공유하는 파일이다. 여기서 필요할 때 주입한다.
 *
 * ## 실패 두 가지를 구분한다
 *
 * | 무엇 | 어떻게 안다 | status |
 * | --- | --- | --- |
 * | env 미설정 | `NEXT_PUBLIC_NAVER_MAP_KEY_ID` 가 비었다 | `credential` |
 * | script 를 못 받음 | `onerror` · 타임아웃 | `network` |
 * | key · 서비스 URL 불일치 | SDK 가 `window.navermap_authFailure` 를 부른다 | `credential` |
 *
 * 인증 실패는 **script 가 정상 로드된 뒤에** 통지된다. 그래서 로드 성공과 인증 성공이
 * 같은 순간이 아니고, `subscribeAuthFailure` 로 나중에 오는 통지를 따로 받는다.
 *
 * **`ncpKeyId` 만 브라우저에 둔다**(D3-B). 이 값은 public client identifier 이고 secret 이
 * 아니다 — 보호는 값의 비밀 유지가 아니라 Console 의 Web 서비스 URL 등록이 한다.
 * NCP Client Secret 은 이 경로에 쓰지 않으며 번들에 넣지 않는다.
 */

/** D3-B 가 정한 client env 이름. 값은 저장소에 두지 않는다. */
const KEY_ID = process.env.NEXT_PUBLIC_NAVER_MAP_KEY_ID;

/** D3-B 가 고정한 SDK 주소. 파라미터는 `ncpKeyId` 다(구 `ncpClientId` 가 아니다). */
const SDK_ORIGIN = "https://oapi.map.naver.com/openapi/v3/maps.js";

/** script 를 이만큼 기다려도 오지 않으면 network 실패로 본다. */
const LOAD_TIMEOUT_MS = 10_000;

export type MapLoadFailure = "credential" | "network";

export class NaverMapsLoadError extends Error {
  constructor(readonly reason: MapLoadFailure) {
    super(`NAVER Maps load failed: ${reason}`);
    this.name = "NaverMapsLoadError";
  }
}

/* ------------------------------------------------------------------ *
 * SDK 타입
 *
 * `@types/navermaps` 를 넣지 않는다 — #84 의 「추가 dependency: 현재 없음」이다.
 * 대신 **이 파일이 실제로 쓰는 표면만** 손으로 적는다. 쓰지 않는 API 는 적지 않는다.
 * ------------------------------------------------------------------ */

export type NaverLatLng = { lat(): number; lng(): number };
export type NaverPoint = unknown;

type MapOptions = {
  center: NaverLatLng;
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  /** 기본 UI 를 전부 끈다. 확대 · 축소 · 재중심은 디자인대로 화면이 그린다. */
  mapDataControl?: boolean;
  scaleControl?: boolean;
  logoControl?: boolean;
  zoomControl?: boolean;
};

export type NaverLatLngBounds = unknown;

export type NaverMap = {
  setCenter(latlng: NaverLatLng): void;
  panTo(latlng: NaverLatLng, options?: { duration?: number }): void;
  /** 경로 전체가 보이도록 중심 · 확대를 한 번에 맞춘다. */
  fitBounds(bounds: NaverLatLngBounds, margin?: number): void;
  getZoom(): number;
  setZoom(zoom: number, useEffect?: boolean): void;
  destroy(): void;
};

/** `Marker` · `Polyline` · `Polygon` 이 공유하는 것 중 여기서 쓰는 것. */
export type NaverOverlay = {
  setMap(map: NaverMap | null): void;
};

type MarkerOptions = {
  position: NaverLatLng;
  map: NaverMap;
  zIndex?: number;
  icon?: { content: string; anchor: NaverPoint };
};

type PolylineOptions = {
  map: NaverMap;
  path: NaverLatLng[];
  strokeColor: string;
  strokeWeight: number;
  strokeOpacity: number;
  strokeLineCap?: "round";
  strokeLineJoin?: "round";
  clickable?: false;
};

type PolygonOptions = {
  map: NaverMap;
  paths: NaverLatLng[][];
  fillColor: string;
  fillOpacity: number;
  strokeColor: string;
  strokeWeight: number;
  strokeOpacity: number;
  strokeStyle?: "shortdash";
  clickable?: false;
};

export type NaverListener = unknown;

export type NaverMapsNamespace = {
  Map: new (element: HTMLElement, options: MapOptions) => NaverMap;
  LatLng: new (lat: number, lng: number) => NaverLatLng;
  Point: new (x: number, y: number) => NaverPoint;
  LatLngBounds: new (sw: NaverLatLng, ne: NaverLatLng) => NaverLatLngBounds;
  Marker: new (options: MarkerOptions) => NaverOverlay;
  Polyline: new (options: PolylineOptions) => NaverOverlay;
  Polygon: new (options: PolygonOptions) => NaverOverlay;
  Event: {
    addListener(
      target: NaverMap,
      eventName: string,
      handler: () => void,
    ): NaverListener;
    removeListener(listener: NaverListener): void;
  };
};

type NaverGlobal = {
  naver?: { maps?: NaverMapsNamespace };
  navermap_authFailure?: () => void;
};

function naverWindow(): NaverGlobal {
  return window as unknown as NaverGlobal;
}

/* ------------------------------------------------------------------ *
 * 인증 실패 통지
 * ------------------------------------------------------------------ */

let authFailed = false;
const authFailureListeners = new Set<() => void>();

/**
 * SDK 가 인증 실패를 알려 오면 부른다. **script 를 넣기 전에 등록해야** 놓치지 않는다.
 *
 * 이미 실패한 뒤에 구독하는 경우(다른 화면이 먼저 열렸다가 이 화면으로 온 경우)에도
 * 곧바로 알려 준다 — 그렇지 않으면 두 번째 화면이 영영 로딩으로 남는다.
 */
export function subscribeAuthFailure(listener: () => void): () => void {
  if (authFailed) {
    listener();
    return () => {};
  }

  authFailureListeners.add(listener);
  return () => authFailureListeners.delete(listener);
}

function installAuthFailureHook() {
  const target = naverWindow();
  if (target.navermap_authFailure) return;

  target.navermap_authFailure = () => {
    authFailed = true;
    // 원인 값 · key 를 로그에 남기지 않는다. 화면이 안내를 띄우는 것으로 끝낸다.
    for (const listener of authFailureListeners) listener();
    authFailureListeners.clear();
  };
}

/* ------------------------------------------------------------------ *
 * 로더
 * ------------------------------------------------------------------ */

let pending: Promise<NaverMapsNamespace> | null = null;

/**
 * SDK 를 한 번만 받아 `naver.maps` 를 돌려준다. 여러 화면이 동시에 불러도 script 는 하나다.
 *
 * 실패한 promise 는 캐시하지 않는다 — 「다시 시도」가 실제로 다시 받아야 하기 때문이다.
 */
export function loadNaverMaps(): Promise<NaverMapsNamespace> {
  const existing = naverWindow().naver?.maps;
  if (existing) return Promise.resolve(existing);

  if (pending) return pending;

  pending = new Promise<NaverMapsNamespace>((resolve, reject) => {
    if (!KEY_ID) {
      // 값이 아니라 없다는 사실만 말한다. 화면은 credential 안내를 띄운다.
      reject(new NaverMapsLoadError("credential"));
      return;
    }

    installAuthFailureHook();

    const script = document.createElement("script");
    script.src = `${SDK_ORIGIN}?ncpKeyId=${encodeURIComponent(KEY_ID)}`;
    script.async = true;

    const timer = window.setTimeout(() => {
      cleanup();
      script.remove();
      reject(new NaverMapsLoadError("network"));
    }, LOAD_TIMEOUT_MS);

    function cleanup() {
      window.clearTimeout(timer);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    }

    function onLoad() {
      cleanup();
      const maps = naverWindow().naver?.maps;
      if (maps) {
        resolve(maps);
        return;
      }
      // script 는 200 인데 namespace 가 없다. 정상 SDK 가 아니므로 network 로 본다.
      script.remove();
      reject(new NaverMapsLoadError("network"));
    }

    function onError() {
      cleanup();
      script.remove();
      reject(new NaverMapsLoadError("network"));
    }

    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    document.head.appendChild(script);
  });

  pending = pending.catch((error) => {
    pending = null;
    throw error;
  });

  return pending;
}
