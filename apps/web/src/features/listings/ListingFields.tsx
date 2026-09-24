import { COMMISSION_PERCENTS } from '@crm/shared';
import { NumberInput, Select, SimpleGrid, TextInput, Textarea } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import { useDictionaries } from './api';
import type { ListingFormValues } from './formValues';

interface Props {
  form: UseFormReturnType<ListingFormValues>;
  /** Поле недоступно текущему пользователю (ограничения партнёра, БТ-2.3). */
  isLocked?: (field: keyof ListingFormValues) => boolean;
}

/** Основные поля объявления — общие для создания и редактирования. */
export function ListingFields({ form, isLocked = () => false }: Props) {
  const dicts = useDictionaries();
  const options = (kind: 'district' | 'property_type') =>
    (dicts.data?.[kind] ?? []).map((d) => ({ value: String(d.id), label: d.name }));
  const input = (field: keyof ListingFormValues) => ({
    ...form.getInputProps(field),
    disabled: isLocked(field),
  });

  return (
    <>
      <TextInput label="Название" withAsterisk {...input('title')} />
      <TextInput
        label="Ссылка на объявление"
        placeholder="https://www.list.am/item/…"
        description="По ссылке CRM находит дубли"
        {...input('sourceUrl')}
      />

      <SimpleGrid cols={2}>
        <NumberInput label="Цена" min={0} thousandSeparator=" " {...input('price')} />
        <Select
          label="Валюта"
          data={['USD', 'AMD', 'RUB', 'EUR']}
          allowDeselect={false}
          {...input('currency')}
        />
        <Select
          label="Район"
          data={options('district')}
          clearable
          searchable
          {...input('districtId')}
        />
        <Select
          label="Тип объекта"
          data={options('property_type')}
          clearable
          {...input('propertyTypeId')}
        />
        <NumberInput label="Комнат" min={0} {...input('rooms')} />
        <NumberInput label="Площадь, м²" min={0} {...input('area')} />
        <NumberInput label="Этаж" {...input('floor')} />
        <NumberInput label="Этажей в доме" min={0} {...input('floorsTotal')} />
      </SimpleGrid>

      <TextInput label="Адрес" {...input('address')} />
      <SimpleGrid cols={{ base: 1, xs: 2 }}>
        <TextInput label="Собственник" {...input('ownerName')} />
        <TextInput label="Телефон" type="tel" placeholder="+374 …" {...input('phone')} />
      </SimpleGrid>
      <TextInput label="Другие контакты" {...input('contactsExtra')} />
      <Textarea label="Описание" autosize minRows={3} {...input('description')} />
    </>
  );
}

export const COMMISSION_OPTIONS = COMMISSION_PERCENTS.map((p) => ({
  value: String(p),
  label: `${p}%`,
}));
