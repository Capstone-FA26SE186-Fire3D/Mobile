export function nextVersion(previous, messages) {
  if (!previous) return '1.0.0';
  if (!/^\d+\.\d+\.\d+$/.test(previous)) throw new Error('Invalid previous release version.');
  const versions = previous.split('.').map(Number);
  let bump = 2;
  for (const message of messages) {
    const subject = message.split('\n')[0];
    if (/^[\w-]+(?:\([^\r\n)]+\))?!:/.test(subject) || /^BREAKING[ -]CHANGE:/m.test(message)) {
      bump = 0;
      break;
    }
    if (/^feat(?:\([^\r\n)]+\))?:/.test(subject)) bump = 1;
  }
  versions[bump] += 1;
  for (let index = bump + 1; index < 3; index++) versions[index] = 0;
  return versions.join('.');
}

export function hasAppChanges(files) {
  return files.some(
    (file) =>
      !/^(?:docs|tests|\.codex|\.agents)\//.test(file) &&
      !/\.md$/i.test(file) &&
      !/^\.github\/(?:ISSUE_TEMPLATE|PULL_REQUEST_TEMPLATE)/.test(file),
  );
}

export function androidVersionCode(runNumber, runAttempt, base = '1000000') {
  for (const value of [runNumber, runAttempt, base])
    if (!/^\d+$/.test(String(value))) throw new Error('Invalid Android build counter.');
  const attempt = Number(runAttempt);
  const number = Number(runNumber);
  const code = Number(base) + number * 100 + attempt;
  if (number < 1 || attempt < 1 || attempt > 99 || !Number.isSafeInteger(code) || code > 2100000000)
    throw new Error('Android build counter is out of range.');
  return code;
}
