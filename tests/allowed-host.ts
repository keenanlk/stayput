import { test } from '@playwright/test';

/** The host a page under test is served from: the project's baseURL, so a spec runs the same locally and against the live site. */
export function siteHost(): string {
  return new URL(test.info().project.use.baseURL ?? 'http://localhost:4321').hostname;
}
