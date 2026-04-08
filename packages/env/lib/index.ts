import { config } from '@dotenvx/dotenvx';

const parsedEnv =
  config({
    path: `${import.meta.dirname}/../../../../.env`,
  }).parsed ?? {};

const runtimeEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    key.startsWith('CEB_') || key.startsWith('CLI_CEB_') || key.startsWith('FIREBASE_'),
  ),
);

export const baseEnv = {
  ...parsedEnv,
  ...runtimeEnv,
};

export const dynamicEnvValues = {
  CEB_NODE_ENV: baseEnv.CEB_DEV === 'true' ? 'development' : 'production',
} as const;
