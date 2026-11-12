import { describe, expect, it } from 'vitest';
import { FULL_CAPABILITIES } from '../host/capabilities.js';
import type { RoomState } from '../host/session-adapters.js';
import { connectionGate, connectionPhase, gateCapabilities } from './connection.js';

const SYNCED: RoomState = {
  status: 'connected',
  access: 'read-write',
  synced: true,
  hasUnconfirmedChanges: false,
  refusal: null,
  roomGeneration: null,
  saveStatus: 'saved',
};

describe('connection phases', () => {
  it('DOCE-COLLAB-5.1 reads the phase from the room connection’s state', () => {
    expect(connectionPhase(SYNCED)).toBe('synced');
    expect(connectionPhase({ ...SYNCED, status: 'connecting', synced: false })).toBe('connecting');
    expect(connectionPhase({ ...SYNCED, access: 'pending', synced: false })).toBe('connecting');
    expect(connectionPhase({ ...SYNCED, synced: false })).toBe('connecting');
    expect(connectionPhase({ ...SYNCED, status: 'disconnected', synced: false })).toBe('offline');
    expect(connectionPhase({ ...SYNCED, access: 'read-only' })).toBe('read-only');
    expect(connectionPhase({ ...SYNCED, status: 'disconnected', refusal: 'forbidden' })).toBe(
      'refused',
    );
    expect(
      connectionPhase({
        ...SYNCED,
        status: 'disconnected',
        refusal: 'generation',
        roomGeneration: 'g2',
      }),
    ).toBe('generation-mismatch');
  });

  it('DOCE-COLLAB-5.2 edits at once from a cached state, and waits for the first sync without one', () => {
    const fresh = { cached: false, hasSynced: false };
    const cached = { cached: true, hasSynced: false };
    expect(connectionGate('connecting', fresh)).toEqual({ editable: false, locked: false });
    expect(connectionGate('offline', fresh)).toEqual({ editable: false, locked: false });
    expect(connectionGate('connecting', cached)).toEqual({ editable: true, locked: false });
    expect(connectionGate('offline', cached)).toEqual({ editable: true, locked: false });
    expect(connectionGate('synced', fresh)).toEqual({ editable: true, locked: false });
    // Once synced, the editor holds the room's state: a dropped connection keeps it editable.
    expect(connectionGate('offline', { cached: false, hasSynced: true }).editable).toBe(true);
  });

  it('DOCE-COLLAB-5.2 locks every surface when refused or holding another generation', () => {
    const options = { cached: true, hasSynced: true };
    for (const phase of ['refused', 'generation-mismatch'] as const) {
      const gate = connectionGate(phase, options);
      expect(gate).toEqual({ editable: false, locked: true });
      expect(gateCapabilities(FULL_CAPABILITIES, gate)).toEqual({
        ...FULL_CAPABILITIES,
        edit: false,
        suggest: false,
        decide: false,
        saveVersion: false,
        comment: false,
      });
    }
  });

  it('DOCE-COLLAB-5.2 keeps comments while only content changes wait', () => {
    const gate = connectionGate('read-only', { cached: false, hasSynced: true });
    expect(gateCapabilities(FULL_CAPABILITIES, gate)).toMatchObject({
      edit: false,
      suggest: false,
      comment: true,
      history: true,
    });
    const synced = connectionGate('synced', { cached: false, hasSynced: true });
    expect(gateCapabilities(FULL_CAPABILITIES, synced)).toBe(FULL_CAPABILITIES);
  });
});
