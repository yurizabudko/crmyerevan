import type { z } from 'zod';

/** Валидация формы Mantine схемой zod из @crm/shared: те же правила, что и на сервере. */
export function zodValidate<T extends z.ZodType>(schema: T) {
  return (values: unknown): Record<string, string> => {
    const result = schema.safeParse(values);
    if (result.success) return {};
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.');
      errors[key] ??= issue.message;
    }
    return errors;
  };
}

/** Переносит ошибки полей из ответа API в форму. */
export function issuesToErrors(issues: { path: string; message: string }[] = []) {
  return Object.fromEntries(issues.map((i) => [i.path, i.message]));
}
