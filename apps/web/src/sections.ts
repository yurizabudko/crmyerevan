import {
  IconAddressBook,
  IconBuildingEstate,
  IconChartBar,
  IconSettings,
  IconTable,
  type Icon,
} from '@tabler/icons-react';

export interface Section {
  path: string;
  title: string;
  icon: Icon;
}

/** Разделы CRM (п. 1.2). Видимость по ролям добавится вместе с авторизацией. */
export const SECTIONS: Section[] = [
  { path: '/listings', title: 'Воронка объявлений', icon: IconBuildingEstate },
  { path: '/clients', title: 'Воронка клиентов', icon: IconAddressBook },
  { path: '/table', title: 'Таблица', icon: IconTable },
  { path: '/dashboard', title: 'Дашборд', icon: IconChartBar },
  { path: '/admin', title: 'Администрирование', icon: IconSettings },
];
