import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function skipPlayRelease({ eventName, ref, headMessage }) {
  return (
    eventName === 'push' &&
    ref === 'refs/heads/main' &&
    typeof headMessage === 'string' &&
    headMessage.includes('[skip-play-release]')
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const skip = skipPlayRelease({
    eventName: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF,
    headMessage: event.head_commit?.message,
  });
  appendFileSync(process.env.GITHUB_OUTPUT, `skip_release=${skip}\n`);
  const decision = skip
    ? 'Code-only main push: release planning, EAS build, Google Play submit and release tag are skipped. CI checks still run.'
    : 'Release opt-out does not apply. Existing branch, destination and version rules decide release work.';
  console.log(decision);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, decision + '\n');
}
