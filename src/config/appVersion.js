import { env } from './env';

export const APP_VERSION = env.appVersion || `v${__APP_PACKAGE_VERSION__}`;
export const BUILD_INFO = Object.freeze({
  appVersion: APP_VERSION,
  commitSha: env.gitCommitSha,
  buildId: env.buildId,
  buildTimestamp: env.buildTimestamp,
});
