export function nativeFixture() {
  return {
    journal: [],
    acknowledgements: [],
    launches: [],
    aborts: [],
    listeners: new Set(),
    active: null,
    nextId: 1,
    handshakeValue: { source: 'embedded', runtimeVersion: '2.5.0', protocolVersion: '1' },
    push(message, receivedAt = Date.now()) {
      this.journal.push({
        id: this.nextId++,
        payload: typeof message === 'string' ? message : JSON.stringify(message),
        receivedAt,
      });
    },
    async pendingCallbacks() {
      return [...this.journal];
    },
    async acknowledgeCallback(id) {
      this.acknowledgements.push(id);
      this.journal = this.journal.filter((c) => c.id !== id);
    },
    async launch(payload) {
      this.launches.push(JSON.parse(payload));
    },
    async abort(reason) {
      this.aborts.push(JSON.parse(reason));
    },
    async show() {
      return this.active !== null;
    },
    async pause() {},
    async resume() {},
    async activeSession() {
      return this.active;
    },
    async handshake() {
      return this.handshakeValue;
    },
    addListener(_event, listener) {
      this.listeners.add(listener);
      return { remove: () => this.listeners.delete(listener) };
    },
    emit() {
      for (const listener of this.listeners) listener({ id: this.nextId - 1 });
    },
    reset() {
      this.journal = [];
      this.acknowledgements = [];
      this.launches = [];
      this.aborts = [];
      this.active = null;
      this.nextId = 1;
    },
  };
}
export const event = (sequence, extra = {}) => ({
  eventId: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
  sequence,
  schemaVersion: '1',
  type: 'Moved',
  occurredAt: '2026-11-24T01:00:00Z',
  elapsedMs: sequence * 100,
  payload: { distanceMeters: 1 },
  ...extra,
});
