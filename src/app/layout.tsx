import type { Metadata, Viewport } from "next";

import "./globals.css";

const DESCRIPTION = "성남 탄천에서 달린 거리로 이웃 러너들과 가볍게 경쟁하는 러닝 앱";

/**
 * 링크 미리보기(og:image)의 절대 URL 기준점.
 *
 * **여기서 던지지 않는다.** `APP_ORIGIN` 의 형식을 강제하는 곳은 `readAuthEnv()` 이고(#79),
 * 그건 서버 시작 시 돈다. 미리보기 메타 하나 때문에 `npm run build` 가 env 형식에 발목
 * 잡히면 안 된다 — 빈 값 · 스킴 없는 값이면 조용히 기본값으로 떨어진다.
 */
function metadataBase(): URL {
  const raw = process.env.APP_ORIGIN?.trim();
  if (raw) {
    try {
      return new URL(raw);
    } catch {
      // 형식이 틀린 것은 readAuthEnv() 가 서버 시작 시 이름만 말하고 멈춘다. 여기서는 넘어간다.
    }
  }
  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  /*
    og:image 는 절대 URL 이어야 링크 미리보기가 뜬다. 상대 경로면 Next 가
    `http://localhost:3000` 을 붙여 배포에서 깨진다. `APP_ORIGIN` 은 이미 필수 서버
    env 라 새로 늘리지 않는다(#78 D3-A · #79).
  */
  metadataBase: metadataBase(),
  title: "탄천런",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: "탄천런",
    title: "탄천런",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "탄천런",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#FBF7EF",
  // AppShell 과 Header 가 env(safe-area-inset-*) 를 쓰려면 필요하다.
  viewportFit: "cover",
};

/**
 * 모든 화면에 공통으로 걸리는 것만 둔다.
 *
 * AppShell 은 여기에 넣지 않는다 — 넣으면 모든 페이지에 같은 헤더가 박혀서
 * 화면별 header 상태를 분리할 수 없다. 각 화면이 스스로 AppShell 을 감싼다.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
