export const DICTIONARY_KINDS = ['source', 'district', 'property_type', 'reject_reason'] as const;
export type DictionaryKind = (typeof DICTIONARY_KINDS)[number];

export interface DictionarySeedItem {
  code: string;
  name: string;
}

/** Начальное наполнение справочников; дальше их редактирует Владелец. */
export const DICTIONARY_SEED: Record<DictionaryKind, readonly DictionarySeedItem[]> = {
  source: [
    { code: 'call', name: 'Звонок' },
    { code: 'referral', name: 'Рекомендация' },
    { code: 'ads', name: 'Реклама' },
    { code: 'other', name: 'Другое' },
  ],
  district: [
    { code: 'kentron', name: 'Кентрон' },
    { code: 'arabkir', name: 'Арабкир' },
    { code: 'ajapnyak', name: 'Аджапняк' },
    { code: 'avan', name: 'Аван' },
    { code: 'davtashen', name: 'Давташен' },
    { code: 'erebuni', name: 'Эребуни' },
    { code: 'kanaker_zeytun', name: 'Канакер-Зейтун' },
    { code: 'malatia_sebastia', name: 'Малатия-Себастия' },
    { code: 'nor_nork', name: 'Нор-Норк' },
    { code: 'nork_marash', name: 'Норк-Мараш' },
    { code: 'nubarashen', name: 'Нубарашен' },
    { code: 'shengavit', name: 'Шенгавит' },
  ],
  property_type: [
    { code: 'apartment', name: 'Квартира' },
    { code: 'house', name: 'Дом' },
    { code: 'commercial', name: 'Коммерческая' },
  ],
  reject_reason: [
    { code: 'expensive', name: 'Дорого' },
    { code: 'found_elsewhere', name: 'Нашёл другой вариант' },
    { code: 'changed_mind', name: 'Передумал' },
    { code: 'no_answer', name: 'Не выходит на связь' },
    { code: 'other', name: 'Другое' },
  ],
};
