import type { dynamicEnvValues } from './index.js';

interface ICebEnv {
  readonly CEB_EXAMPLE: string;
  readonly CEB_DEV_LOCALE: string;
  readonly CEB_MOBILE: string;
  readonly CEB_DEFAULT_WEBSOCKET_URL: string;
  readonly CEB_DEFAULT_STREAMABLE_HTTP_URL: string;
  readonly CEB_DEFAULT_SSE_URL: string;
}

interface ICebCliEnv {
  readonly CLI_CEB_DEV: string;
  readonly CLI_CEB_FIREFOX: string;
}

export type IEnv = ICebEnv & ICebCliEnv & typeof dynamicEnvValues;
