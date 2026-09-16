import "server-only";

import * as client from "openid-client";

import { issuerFor, readAuthEnv, type AuthProvider } from "./config";

/**
 * provider 별 `openid-client` Configuration(D2).
 *
 * **OAuth/OIDC 암호 검증을 직접 구현하지 않는다.** ID token 서명 · `iss` · `aud` · 시각 ·
 * `nonce` · `state` 검증은 전부 이 라이브러리가 한다.
 *
 * 인증 방식은 양쪽 모두 `client_secret_post` 다. Kakao discovery 의
 * `token_endpoint_auth_methods_supported` 가 `["client_secret_post"]` 하나뿐이라
 * 기본값인 basic 을 쓸 수 없고, Google 은 둘 다 지원해서 맞춰 뒀다.
 */

/**
 * discovery 결과를 promise 째로 캐시한다. 동시에 여러 요청이 들어와도 왕복이 한 번이고,
 * 실패하면 캐시를 비워 다음 요청이 다시 시도한다(실패를 영구 캐시하지 않는다).
 */
const configurations = new Map<AuthProvider, Promise<client.Configuration>>();

export function getProviderConfig(
  provider: AuthProvider,
): Promise<client.Configuration> {
  const cached = configurations.get(provider);
  if (cached) return cached;

  const { credentials } = readAuthEnv();
  const { clientId, clientSecret } = credentials[provider];

  const pending = client
    .discovery(
      issuerFor(provider),
      clientId,
      undefined,
      client.ClientSecretPost(clientSecret),
    )
    .catch((error: unknown) => {
      configurations.delete(provider);
      throw error;
    });

  configurations.set(provider, pending);
  return pending;
}
