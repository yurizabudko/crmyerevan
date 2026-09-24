import { MultiSelect, NumberInput, Select, SimpleGrid, TextInput, Textarea } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import { useDictionaries } from '../listings/api';
import type { ClientFormValues } from './formValues';

/** Поля клиента (4.3) — общие для создания и правки. */
export function ClientFields({ form }: { form: UseFormReturnType<ClientFormValues> }) {
  const dicts = useDictionaries();
  const options = (kind: 'district' | 'property_type' | 'source') =>
    (dicts.data?.[kind] ?? []).map((d) => ({ value: String(d.id), label: d.name }));

  return (
    <>
      <TextInput label="Имя" withAsterisk {...form.getInputProps('name')} />
      <SimpleGrid cols={{ base: 1, xs: 2 }}>
        <TextInput
          label="Телефон"
          type="tel"
          placeholder="+374 …"
          withAsterisk
          {...form.getInputProps('phone')}
        />
        <TextInput
          label="Мессенджер"
          placeholder="WhatsApp, Telegram…"
          {...form.getInputProps('messenger')}
        />
      </SimpleGrid>
      <Select
        label="Источник"
        data={options('source')}
        withAsterisk
        {...form.getInputProps('sourceId')}
      />

      <SimpleGrid cols={3}>
        <NumberInput
          label="Бюджет от"
          min={0}
          thousandSeparator=" "
          {...form.getInputProps('budgetMin')}
        />
        <NumberInput
          label="Бюджет до"
          min={0}
          thousandSeparator=" "
          {...form.getInputProps('budgetMax')}
        />
        <Select
          label="Валюта"
          data={['USD', 'AMD', 'RUB', 'EUR']}
          allowDeselect={false}
          {...form.getInputProps('currency')}
        />
      </SimpleGrid>
      <MultiSelect
        label="Районы"
        data={options('district')}
        searchable
        clearable
        {...form.getInputProps('districtIds')}
      />
      <SimpleGrid cols={2}>
        <Select
          label="Тип объекта"
          data={options('property_type')}
          clearable
          {...form.getInputProps('propertyTypeId')}
        />
        <TextInput
          label="Сроки"
          placeholder="например, 2 месяца"
          {...form.getInputProps('timeframe')}
        />
        <NumberInput label="Комнат от" min={0} {...form.getInputProps('roomsMin')} />
        <NumberInput label="Комнат до" min={0} {...form.getInputProps('roomsMax')} />
      </SimpleGrid>
      <TextInput
        label="Этаж"
        placeholder="не первый, не последний…"
        {...form.getInputProps('floorPreference')}
      />
      <Textarea label="Заметки" autosize minRows={2} {...form.getInputProps('notes')} />
    </>
  );
}
