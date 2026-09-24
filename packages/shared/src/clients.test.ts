import { describe, expect, it } from 'vitest';
import {
  ClientDraft,
  ClientPatch,
  checkClientTransition,
  clientTransitionRequirements,
  type ClientSnapshot,
} from './clients.js';
import type { Actor } from './permissions.js';

const perms = { grantAccess: false, deleteCards: false, manageDictionaries: false };
const owner: Actor = { id: 1, role: 'owner', perms };
const employee: Actor = { id: 2, role: 'employee', perms };
const partner: Actor = { id: 3, role: 'partner', perms };

const empty: ClientSnapshot = {
  budgetMin: null,
  budgetMax: null,
  districtIds: null,
  propertyTypeId: null,
  timeframe: null,
  agreedPrice: null,
  linkedListings: 0,
};
const qualified: ClientSnapshot = {
  ...empty,
  budgetMax: 120000,
  districtIds: [1],
  propertyTypeId: 2,
  timeframe: '2 месяца',
};
const stage = (code: string, isTerminal = false) => ({ code, isTerminal });

describe('clientTransitionRequirements', () => {
  it('asks for the first conversation when leaving the call stage forward', () => {
    expect(clientTransitionRequirements('call', 'qualified')).toMatchObject({
      conversationConfirmed: true,
      qualification: true,
      linkedListing: false,
    });
    expect(clientTransitionRequirements('call', 'rejected')).toMatchObject({
      conversationConfirmed: false,
      rejectReason: true,
    });
  });

  it('accumulates requirements when skipping stages', () => {
    expect(clientTransitionRequirements('new', 'deal_closed')).toEqual({
      conversationConfirmed: true,
      qualification: true,
      linkedListing: true,
      showingAt: false,
      agreedPrice: false,
      deal: true,
      rejectReason: false,
    });
  });
});

describe('checkClientTransition', () => {
  it('lists missing qualification fields', () => {
    const errors = checkClientTransition({
      actor: employee,
      from: stage('call'),
      to: stage('qualified'),
      client: { ...empty, budgetMax: 90000 },
      input: { conversationConfirmed: true },
    });
    expect(errors).toEqual(['Заполните в карточке: район, тип объекта, сроки']);
  });

  it('requires a linked listing for selection', () => {
    const base = { actor: employee, from: stage('qualified'), to: stage('selection'), input: {} };
    expect(checkClientTransition({ ...base, client: qualified })).toEqual([
      'Привяжите к клиенту хотя бы одно объявление',
    ]);
    expect(checkClientTransition({ ...base, client: { ...qualified, linkedListings: 1 } })).toEqual(
      [],
    );
  });

  it('checks stage-specific inputs', () => {
    const ready = { ...qualified, linkedListings: 2 };
    const check = (to: string, input = {}, client = ready) =>
      checkClientTransition({
        actor: employee,
        from: stage('selection'),
        to: stage(to),
        client,
        input,
      });
    expect(check('showings')).toEqual(['Укажите дату и время показа']);
    expect(check('negotiation')).toEqual(['Укажите согласованную цену']);
    expect(check('negotiation', {}, { ...ready, agreedPrice: 100000 })).toEqual([]);
    expect(check('deal_closed', { finalPrice: 100000 })).toEqual(['Укажите комиссию (факт)']);
    expect(check('rejected')).toEqual(['Укажите причину отказа']);
    expect(check('rejected', { rejectReasonId: 4 })).toEqual([]);
  });

  it('keeps partners within the first three stages and terminal stages with the owner', () => {
    expect(
      checkClientTransition({
        actor: partner,
        from: stage('qualified'),
        to: stage('selection'),
        client: { ...qualified, linkedListings: 1 },
        input: {},
      })[0],
    ).toMatch(/Партнёр/);
    const reopen = { from: stage('rejected', true), to: stage('call'), client: empty, input: {} };
    expect(checkClientTransition({ ...reopen, actor: employee })[0]).toMatch(/Владелец/);
    expect(checkClientTransition({ ...reopen, actor: owner })).toEqual([]);
  });
});

describe('client schemas', () => {
  it('requires name, phone and source on creation', () => {
    expect(ClientDraft.safeParse({ name: 'Анна', phone: '091 000 000' }).success).toBe(false);
    expect(ClientDraft.parse({ name: 'Анна', phone: '091 000 000', sourceId: '3' })).toMatchObject({
      sourceId: 3,
      currency: 'USD',
    });
  });

  it('allows clearing fields in a patch', () => {
    expect(ClientPatch.parse({ version: 2, districtIds: null, budgetMax: null })).toEqual({
      version: 2,
      districtIds: null,
      budgetMax: null,
    });
  });
});
