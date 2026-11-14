/**
 * Formatted Learn text (BE docs/learn-library.md "Formatted text (#172)"): a run is {text, marks?, color?, highlight?, link?}.
 * Plain TS (no React Native) so it is unit-tested; the screen turns each segment into a nested <Text>.
 */
export type LearnMark = 'bold' | 'italic' | 'underline' | 'strike';
export type LearnColor = 'default' | 'ember' | 'danger' | 'warning' | 'success' | 'info';
export type LearnRun = { text: string; marks?: LearnMark[]; color?: LearnColor; highlight?: LearnColor; link?: string };

/** The theme colours a run may use; `soft` is the highlight background of each tone. */
export type RunPalette = {
  ember: string;
  danger: string;
  warning: string;
  success: string;
  info: string;
  emberSoft: string;
  dangerSoft: string;
  warningSoft: string;
  successSoft: string;
  infoSoft: string;
};

export type RunStyle = {
  fontWeight?: 'bold';
  fontStyle?: 'italic';
  textDecorationLine?: 'underline' | 'line-through' | 'underline line-through';
  color?: string;
  backgroundColor?: string;
};

export type Segment = { text: string; style: RunStyle; link: string | null };

const TONES = ['ember', 'danger', 'warning', 'success', 'info'] as const;
type Tone = (typeof TONES)[number];
const isTone = (value: unknown): value is Tone => typeof value === 'string' && (TONES as readonly string[]).includes(value);

/** Only absolute https links open; anything else renders as plain text. */
export function safeLink(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('https://')) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

export function runStyle(run: LearnRun, palette: RunPalette, linkColor: string): RunStyle {
  const marks = new Set(Array.isArray(run.marks) ? run.marks : []);
  const style: RunStyle = {};
  if (marks.has('bold')) style.fontWeight = 'bold';
  if (marks.has('italic')) style.fontStyle = 'italic';
  const underline = marks.has('underline') || safeLink(run.link) !== null;
  const strike = marks.has('strike');
  if (underline || strike)
    style.textDecorationLine = underline && strike ? 'underline line-through' : underline ? 'underline' : 'line-through';
  if (isTone(run.color)) style.color = palette[run.color];
  else if (safeLink(run.link)) style.color = linkColor;
  if (isTone(run.highlight)) style.backgroundColor = palette[`${run.highlight}Soft` as const];
  return style;
}

/** Segments for a block: its runs when present and well formed, else its plain text as one segment. */
export function segments(runs: unknown, text: string, palette: RunPalette, linkColor: string): Segment[] {
  if (Array.isArray(runs)) {
    const valid = runs.filter((run): run is LearnRun => !!run && typeof (run as LearnRun).text === 'string');
    if (valid.length > 0)
      return valid.map((run) => ({ text: run.text, style: runStyle(run, palette, linkColor), link: safeLink(run.link) }));
  }
  return [{ text, style: {}, link: null }];
}
