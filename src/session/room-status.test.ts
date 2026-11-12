import { describe, expect, it } from 'vitest';
import type { RoomState } from '../host/session-adapters.js';
import { roomRefusal, roomSavePhase } from './room-status.js';

const CONNECTED: RoomState = {
  status: 'connected',
  access: 'read-write',
  synced: true,
  hasUnconfirmedChanges: false,
  refusal: null,
  roomGeneration: null,
  saveStatus: null,
};

describe('roomSavePhase', () => {
  it('DOCE-SESSION-3.3 reads the save phase from the room connection’s state', () => {
    expect(roomSavePhase(null)).toBe('idle');
    expect(roomSavePhase(CONNECTED)).toBe('idle');
    expect(roomSavePhase({ ...CONNECTED, status: 'disconnected' })).toBe('offline');
    expect(roomSavePhase({ ...CONNECTED, hasUnconfirmedChanges: true })).toBe('saving');
    expect(roomSavePhase({ ...CONNECTED, saveStatus: 'retrying' })).toBe('saving');
    expect(roomSavePhase({ ...CONNECTED, saveStatus: 'unsaved' })).toBe('dirty');
    expect(roomSavePhase({ ...CONNECTED, saveStatus: 'saved' })).toBe('saved');
  });

  it('DOCE-SESSION-3.3 reports a refusal, and a room of another generation as a conflict', () => {
    expect(roomRefusal(CONNECTED)).toBeNull();
    expect(roomRefusal({ ...CONNECTED, refusal: 'forbidden' })).toEqual({
      kind: 'denied',
      message: 'forbidden',
    });
    expect(roomRefusal({ ...CONNECTED, refusal: 'generation', roomGeneration: 'g2' })).toEqual({
      kind: 'conflict',
      message: 'generation',
    });
  });
});
