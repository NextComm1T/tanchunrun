/**
 * 서버가 뜰 때 한 번 도는 자리(Next `instrumentation`).
 *
 * 여기서 하는 일은 **env 누락을 시작 시 드러내는 것 하나뿐**이다(#79 — "시작 시 누락을
 * fail-fast 로 검사하되 값은 출력하지 않는다").
 *
 * 왜 이 파일이어야 하나 — 모듈 top-level 에서 검사하면 `next build` 가 route 모듈을 적재하며
 * 같이 죽어서 「빌드는 env · DB 없이 통과해야 한다」는 요구가 깨진다. `register()` 는
 * **빌드 때 돌지 않고 서버가 실제로 뜰 때만** 돌아서 둘을 같이 만족한다.
 *
 * 하지 않는 것 — DB 접속 · migration 실행 · 값 출력. `DATABASE_URL` 도 설정 여부만 본다.
 */
export async function register() {
  // Node.js runtime 에서만 본다. edge 는 이 env 를 쓰지 않는다.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // 정적 import 로 올리지 않는다 — runtime 분기 뒤에서만 서버 모듈을 끌어온다.
  const { assertStartupEnv } = await import("@/server/auth/config");
  assertStartupEnv();
}
