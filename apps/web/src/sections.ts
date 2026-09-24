import { can, type UserDto } from '@crm/shared';
import {
  IconAddressBook,
  IconBuildingEstate,
  IconChartBar,
  IconCreditCard,
  IconUsersGroup,
  IconSettings,
  IconTable,
  type Icon,
} from '@tabler/icons-react';

export interface Section {
  path: string;
  title: string;
  icon: Icon;
  visible: (user: UserDto) => boolean;
}

const always = () => true;

/** Разделы CRM (п. 1.2) и их видимость по ролям (2.2, 8.4). */
export const SECTIONS: Section[] = [
  { path: '/listings', title: 'Воронка объявлений', icon: IconBuildingEstate, visible: always },
  { path: '/clients', title: 'Воронка клиентов', icon: IconAddressBook, visible: always },
  // Партнёр видит в таблице только свои записи и не выгружает CSV (БТ-5.8, 5.9).
  { path: '/table', title: 'Таблица', icon: IconTable, visible: always },
  { path: '/dashboard', title: 'Дашборд', icon: IconChartBar, visible: always },
  {
    path: '/cabinet',
    title: 'Подписка',
    icon: IconCreditCard,
    visible: (u) => u.role === 'partner',
  },
  {
    path: '/partners',
    title: 'Партнёры',
    icon: IconUsersGroup,
    visible: (u) => can.confirmPayout(u),
  },
  {
    path: '/admin',
    title: 'Администрирование',
    icon: IconSettings,
    visible: (u) => can.openAdmin(u),
  },
];
