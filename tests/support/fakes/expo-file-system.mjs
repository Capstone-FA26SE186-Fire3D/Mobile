// In-memory stand-in for the expo-file-system (SDK 57) classes the package cache uses. State lives on `globalThis.__fs`:
// `files` (path → bytes), `dirs`, scripted `downloads` (URL without query → bytes | Error | async (signal) => bytes),
// a `downloadLog` of URLs, and `failMove` / `failCopy` predicates (source path → true to make that call throw).
// Semantics follow Expo on Android: File.move/copy need an existing destination folder and `overwrite` for an existing
// destination; downloadFileAsync rejects an existing destination unless `idempotent`, and aborts with AbortError.

const fs = (globalThis.__fs ??= {
  files: new Map(),
  dirs: new Set(['/documents']),
  downloads: new Map(),
  downloadLog: [],
  failMove: null,
  failCopy: null,
  reset() {
    this.files.clear();
    this.dirs = new Set(['/documents']);
    this.downloads.clear();
    this.downloadLog = [];
    this.failMove = null;
    this.failCopy = null;
  },
});

function joinPath(parts) {
  const segments = [];
  for (const part of parts) {
    const raw = typeof part === 'string' ? part : part.path;
    const clean = raw.startsWith('file://') ? decodeURI(raw.slice('file://'.length)) : raw;
    if (clean.startsWith('/')) segments.length = 0;
    for (const piece of clean.split('/')) if (piece) segments.push(piece);
  }
  return `/${segments.join('/')}`;
}

const parentOf = (path) => path.slice(0, path.lastIndexOf('/')) || '/';

function abortError() {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

export class Directory {
  constructor(...parts) {
    this.path = joinPath(parts);
  }
  get uri() {
    return `file://${encodeURI(this.path)}/`;
  }
  get name() {
    return this.path.slice(this.path.lastIndexOf('/') + 1);
  }
  get exists() {
    return fs.dirs.has(this.path);
  }
  get parentDirectory() {
    return new Directory(parentOf(this.path));
  }
  create(options = {}) {
    if (this.exists) {
      if (!options.idempotent) throw new Error(`Directory already exists: ${this.path}`);
      return;
    }
    if (!fs.dirs.has(parentOf(this.path))) {
      if (!options.intermediates) throw new Error(`Parent folder missing: ${this.path}`);
      this.parentDirectory.create({ intermediates: true, idempotent: true });
    }
    fs.dirs.add(this.path);
  }
  delete() {
    if (!this.exists) throw new Error(`Directory does not exist: ${this.path}`);
    const prefix = `${this.path}/`;
    for (const dir of [...fs.dirs])
      if (dir === this.path || dir.startsWith(prefix)) fs.dirs.delete(dir);
    for (const file of [...fs.files.keys()]) if (file.startsWith(prefix)) fs.files.delete(file);
  }
  list() {
    const prefix = `${this.path}/`;
    const direct = (path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/');
    return [
      ...[...fs.dirs].filter(direct).map((path) => new Directory(path)),
      ...[...fs.files.keys()].filter(direct).map((path) => new File(path)),
    ];
  }
}

export class File {
  constructor(...parts) {
    this.path = joinPath(parts);
  }
  get uri() {
    return `file://${encodeURI(this.path)}`;
  }
  get name() {
    return this.path.slice(this.path.lastIndexOf('/') + 1);
  }
  get exists() {
    return fs.files.has(this.path);
  }
  get size() {
    return fs.files.get(this.path)?.length ?? 0;
  }
  get parentDirectory() {
    return new Directory(parentOf(this.path));
  }
  bytes() {
    if (!this.exists) throw new Error(`File does not exist: ${this.path}`);
    return fs.files.get(this.path);
  }
  async text() {
    return new TextDecoder().decode(this.bytes());
  }
  stream() {
    const bytes = this.bytes();
    const half = Math.ceil(bytes.length / 2);
    const chunks = [bytes.slice(0, half), bytes.slice(half)].filter((chunk) => chunk.length);
    return new ReadableStream({
      pull(controller) {
        const next = chunks.shift();
        if (next) controller.enqueue(next);
        else controller.close();
      },
    });
  }
  write(content) {
    if (!fs.dirs.has(parentOf(this.path))) throw new Error(`Parent folder missing: ${this.path}`);
    fs.files.set(
      this.path,
      typeof content === 'string' ? new TextEncoder().encode(content) : Uint8Array.from(content),
    );
  }
  delete() {
    if (!this.exists) throw new Error(`File does not exist: ${this.path}`);
    fs.files.delete(this.path);
  }
  #relocate(destination, options, keepSource) {
    const target =
      destination instanceof Directory ? new File(destination, this.name) : destination;
    if (!this.exists) throw new Error(`File does not exist: ${this.path}`);
    if (!fs.dirs.has(parentOf(target.path)))
      throw new Error(`Destination folder missing: ${target.path}`);
    if (target.exists && !options?.overwrite)
      throw new Error(`Destination already exists: ${target.path}`);
    fs.files.set(target.path, fs.files.get(this.path));
    if (!keepSource) {
      fs.files.delete(this.path);
      this.path = target.path;
    }
  }
  async move(destination, options) {
    if (fs.failMove?.(this.path)) throw new Error(`move failed: ${this.path}`);
    this.#relocate(destination, options, false);
  }
  async copy(destination, options) {
    if (fs.failCopy?.(this.path)) throw new Error(`copy failed: ${this.path}`);
    this.#relocate(destination, options, true);
  }
  static async downloadFileAsync(url, destination, options = {}) {
    const key = url.split('?')[0];
    fs.downloadLog.push(key);
    if (options.signal?.aborted) throw abortError();
    let body = fs.downloads.get(key);
    if (typeof body === 'function') body = await body(options.signal);
    if (options.signal?.aborted) throw abortError();
    if (body instanceof Error) throw body;
    if (!body) throw new Error(`404 ${key}`);
    const target =
      destination instanceof Directory ? new File(destination, key.split('/').pop()) : destination;
    if (target.exists && !options.idempotent)
      throw new Error(`Destination already exists: ${target.path}`);
    target.write(body);
    options.onProgress?.({ bytesWritten: body.length, totalBytes: body.length });
    return target;
  }
}

export const Paths = { document: new Directory('/documents') };
