import { describe, expect, it } from 'vitest';
import type { Actor } from './permissions.js';
import { checkListingTransition, listingTransitionRequirements } from './transitions.js';

const perms = { grantAccess: false, deleteCards: false, manageDictionaries: false };
const owner: Actor = { id: 1, role: 'owner', perms };
const employee: Actor = { id: 2, role: 'employee', perms };
const partner: Actor = { id: 3, role: 'partner', perms };

const stage = (code: string, isTerminal = false) => ({ code, isTerminal });

describe('listingTransitionRequirements', () => {
  it('asks for contact when leaving the call stage', () => {
    expect(listingTransitionRequirements('call', 'available')).toMatchObject({
      contactConfirmed: true,
      actualityConfirmed: false,
    });
  });

  it('asks for actuality and date when scheduling a meeting', () => {
    expect(listingTransitionRequirements('available', 'meeting')).toEqual({
      contactConfirmed: false,
      actualityConfirmed: true,
      meetingAt: true,
      closeOutcome: false,
    });
    // Перескок через этапы требует всех подтверждений сразу.
    expect(listingTransitionRequirements('new', 'meeting')).toMatchObject({
      contactConfirmed: true,
      actualityConfirmed: true,
    });
  });

  it('has no rules for custom stages', () => {
    expect(Object.values(listingTransitionRequirements('custom_1', 'custom_2'))).not.toContain(
      true,
    );
  });
});

describe('checkListingTransition', () => {
  const base = { hasMeetingAt: false, input: {} };

  it('allows plain moves without requirements', () => {
    expect(
      checkListingTransition({ ...base, actor: employee, from: stage('new'), to: stage('call') }),
    ).toEqual([]);
  });

  it('lists every missing requirement', () => {
    const errors = checkListingTransition({
      ...base,
      actor: employee,
      from: stage('call'),
      to: stage('meeting'),
    });
    expect(errors).toHaveLength(3);
  });

  it('accepts an existing meeting date', () => {
    expect(
      checkListingTransition({
        actor: employee,
        from: stage('available'),
        to: stage('meeting'),
        hasMeetingAt: true,
        input: { actualityConfirmed: true },
      }),
    ).toEqual([]);
  });

  it('requires an outcome to close', () => {
    expect(
      checkListingTransition({
        ...base,
        actor: owner,
        from: stage('meeting'),
        to: stage('closed'),
      }),
    ).toEqual(['Укажите исход: сделка или объект потерян']);
  });

  it('keeps partners within the first three stages', () => {
    const toMeeting = checkListingTransition({
      ...base,
      actor: partner,
      from: stage('available'),
      to: stage('meeting'),
      input: { actualityConfirmed: true, meetingAt: '2026-10-01T10:00:00Z' },
    });
    expect(toMeeting[0]).toMatch(/Партнёр/);
    expect(
      checkListingTransition({ ...base, actor: partner, from: stage('new'), to: stage('call') }),
    ).toEqual([]);
  });

  it('lets only the owner reopen a closed listing', () => {
    const reopen = { ...base, from: stage('closed', true), to: stage('available') };
    expect(checkListingTransition({ ...reopen, actor: employee })[0]).toMatch(/Владелец/);
    expect(checkListingTransition({ ...reopen, actor: owner })).toEqual([]);
  });
});
