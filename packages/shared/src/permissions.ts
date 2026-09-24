import type { Role } from './roles.js';

/** Пользователь, от имени которого выполняется действие. */
export interface Actor {
  id: number;
  role: Role;
  perms: {
    grantAccess: boolean;
    deleteCards: boolean;
    manageDictionaries: boolean;
  };
}

const isOwner = (a: Actor) => a.role === 'owner';
const isEmployee = (a: Actor) => a.role === 'employee';

/**
 * Матрица прав (раздел 2.2 и решения В-2, В-3). Проверки видимости конкретных
 * карточек — в сервисах, здесь только права на действия.
 */
export const can = {
  /** Раздел «Пользователи»: создание и блокировка учётных записей. */
  manageUsers: (a: Actor) => isOwner(a) || (isEmployee(a) && a.perms.grantAccess),
  /** Сброс пароля — только Владелец (БТ-2.4.6). */
  resetPassword: isOwner,
  /** Назначение прав сотрудникам — только Владелец. */
  setPermissions: isOwner,
  deleteCards: (a: Actor) => isOwner(a) || (isEmployee(a) && a.perms.deleteCards),
  manageDictionaries: (a: Actor) => isOwner(a) || (isEmployee(a) && a.perms.manageDictionaries),
  exportCsv: (a: Actor) => a.role !== 'partner',
  viewTeamDashboard: isOwner,
  confirmPayout: isOwner,
  /** Системные записи аудита в карточках не видны партнёру (БТ-3.4.2). */
  viewSystemComments: (a: Actor) => a.role !== 'partner',
};

/** Какие роли может создавать пользователь с правом «выдача доступов». */
export function creatableRoles(a: Actor): Role[] {
  if (isOwner(a)) return ['owner', 'employee', 'partner'];
  if (can.manageUsers(a)) return ['employee', 'partner'];
  return [];
}
