/** In-memory snapshot demo mode (Phase 6 — toggled via POST /api/snapshot/toggle, not env). */

let snapshotMode = false;

export function getSnapshotMode(): boolean {
  return snapshotMode;
}

export function toggleSnapshotMode(): boolean {
  snapshotMode = !snapshotMode;
  return snapshotMode;
}
