import { z } from 'zod';
import { ROLES } from './roles.js';

/** Политика паролей (БТ-2.4.4): минимум 8 символов, есть буквы и цифры. */
export const passwordSchema = z
  .string()
  .min(8, 'Пароль должен быть не короче 8 символов')
  .max(128, 'Пароль слишком длинный')
  .regex(/\p{L}/u, 'Пароль должен содержать буквы')
  .regex(/\d/, 'Пароль должен содержать цифры');

export const loginSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Логин не короче 3 символов')
  .max(64)
  .regex(/^[a-z0-9._-]+$/, 'Логин: латиница, цифры, точка, дефис, подчёркивание');

export const LoginRequest = z.object({
  login: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const ChangePasswordRequest = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequest>;

export const PermissionsSchema = z.object({
  grantAccess: z.boolean().default(false),
  deleteCards: z.boolean().default(false),
  manageDictionaries: z.boolean().default(false),
});

export const CreateUserRequest = z.object({
  login: loginSchema,
  displayName: z.string().trim().min(1, 'Укажите имя').max(100),
  role: z.enum(ROLES),
  temporaryPassword: passwordSchema,
  perms: PermissionsSchema.default({
    grantAccess: false,
    deleteCards: false,
    manageDictionaries: false,
  }),
});
export type CreateUserRequest = z.infer<typeof CreateUserRequest>;

export const ResetPasswordRequest = z.object({ temporaryPassword: passwordSchema });
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequest>;

export const SetPermissionsRequest = PermissionsSchema;
export type SetPermissionsRequest = z.infer<typeof SetPermissionsRequest>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const optionalNumber = z.coerce.number().nonnegative().optional();

/**
 * Поля объявления, общие для ручного ввода и автоимпорта (БТ-3.2.2).
 * Автоимпорт должен приводить данные источника к этой же форме.
 */
export const ListingDraft = z.object({
  title: z.string().trim().min(1, 'Укажите название').max(200),
  description: optionalText(10_000),
  price: optionalNumber,
  currency: z.enum(['USD', 'AMD', 'RUB', 'EUR']).default('USD'),
  districtId: z.coerce.number().int().positive().optional(),
  propertyTypeId: z.coerce.number().int().positive().optional(),
  rooms: z.coerce.number().int().min(0).max(50).optional(),
  floor: z.coerce.number().int().min(-5).max(200).optional(),
  floorsTotal: z.coerce.number().int().min(0).max(200).optional(),
  area: optionalNumber,
  address: optionalText(300),
  ownerName: optionalText(100),
  phone: optionalText(40),
  contactsExtra: optionalText(1000),
  sourceUrl: z
    .url('Некорректная ссылка')
    .trim()
    .max(1000)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
export type ListingDraft = z.infer<typeof ListingDraft>;
