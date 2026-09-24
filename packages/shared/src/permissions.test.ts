import { describe, expect, it } from 'vitest';
import { can, creatableRoles, type Actor } from './permissions.js';

const perms = { grantAccess: false, deleteCards: false, manageDictionaries: false };
const owner: Actor = { id: 1, role: 'owner', perms };
const employee: Actor = { id: 2, role: 'employee', perms };
const hrEmployee: Actor = { id: 3, role: 'employee', perms: { ...perms, grantAccess: true } };
const partner: Actor = { id: 4, role: 'partner', perms: { ...perms, grantAccess: true } };

describe('permissions matrix', () => {
  it('limits user management to owner and employees with grantAccess', () => {
    expect(can.manageUsers(owner)).toBe(true);
    expect(can.manageUsers(employee)).toBe(false);
    expect(can.manageUsers(hrEmployee)).toBe(true);
    // Флаг прав у партнёра ничего не даёт.
    expect(can.manageUsers(partner)).toBe(false);
  });

  it('allows password reset and permission changes only to owner', () => {
    expect(can.resetPassword(owner)).toBe(true);
    expect(can.resetPassword(hrEmployee)).toBe(false);
    expect(can.setPermissions(hrEmployee)).toBe(false);
  });

  it('gives card deletion to owner and employees with the right', () => {
    expect(can.deleteCards(owner)).toBe(true);
    expect(can.deleteCards(employee)).toBe(false);
    expect(can.deleteCards({ ...employee, perms: { ...perms, deleteCards: true } })).toBe(true);
    expect(can.deleteCards({ ...partner, perms: { ...perms, deleteCards: true } })).toBe(false);
  });

  it('hides exports and system comments from partners', () => {
    expect(can.exportCsv(partner)).toBe(false);
    expect(can.exportCsv(employee)).toBe(true);
    expect(can.viewSystemComments(partner)).toBe(false);
  });

  it('does not let employees create owners', () => {
    expect(creatableRoles(owner)).toEqual(['owner', 'employee', 'partner']);
    expect(creatableRoles(hrEmployee)).toEqual(['employee', 'partner']);
    expect(creatableRoles(employee)).toEqual([]);
  });
});
