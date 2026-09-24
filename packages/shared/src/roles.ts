export const ROLES = ['owner', 'employee', 'partner'] as const;
export type Role = (typeof ROLES)[number];

/** Дополнительные права сотрудника, выдаются Владельцем (раздел 7.1). */
export const EMPLOYEE_PERMISSIONS = ['grantAccess', 'deleteCards', 'manageDictionaries'] as const;
export type EmployeePermission = (typeof EMPLOYEE_PERMISSIONS)[number];

export const USER_STATUSES = ['active', 'blocked'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
