import { ListingDraft } from '@crm/shared';
import {
  Alert,
  Anchor,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { ApiError } from '../../api/client';
import { issuesToErrors, zodValidate } from '../../lib/zodForm';
import { useCreateListing, useDictionaries } from './api';

interface Props {
  opened: boolean;
  onClose: () => void;
  onOpenListing: (id: number) => void;
}

const EMPTY = {
  title: '',
  description: '',
  price: '' as number | string,
  currency: 'USD',
  districtId: null as string | null,
  propertyTypeId: null as string | null,
  rooms: '' as number | string,
  floor: '' as number | string,
  floorsTotal: '' as number | string,
  area: '' as number | string,
  address: '',
  ownerName: '',
  phone: '',
  contactsExtra: '',
  sourceUrl: '',
};

type FormValues = typeof EMPTY;

/** Пустые поля формы убираем, чтобы zod-схема видела их как незаполненные. */
function toDraftInput(values: FormValues) {
  return Object.fromEntries(
    Object.entries(values).filter(([, v]) => v !== '' && v !== null && v !== undefined),
  );
}

/** Ручное добавление объявления (п. 3.2, «Ручной ввод»). */
export function AddListingModal({ opened, onClose, onOpenListing }: Props) {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const create = useCreateListing();
  const dicts = useDictionaries();
  const form = useForm<FormValues>({
    initialValues: EMPTY,
    validate: (values) => zodValidate(ListingDraft)(toDraftInput(values)),
  });

  const duplicateId =
    create.error instanceof ApiError && create.error.code === 'DUPLICATE_LISTING'
      ? create.error.body.existingId
      : undefined;

  const close = () => {
    form.reset();
    create.reset();
    onClose();
  };

  const submit = form.onSubmit((values) => {
    const draft = ListingDraft.parse(toDraftInput(values));
    create.mutate(draft, {
      onSuccess: (listing) => {
        notifications.show({ color: 'green', message: `Объявление «${listing.title}» добавлено` });
        close();
      },
      onError: (error) => {
        if (error instanceof ApiError && error.body.issues) {
          form.setErrors(issuesToErrors(error.body.issues));
        }
      },
    });
  });

  const options = (kind: 'district' | 'property_type') =>
    (dicts.data?.[kind] ?? []).map((d) => ({ value: String(d.id), label: d.name }));

  return (
    <Modal opened={opened} onClose={close} title="Новое объявление" size="lg" fullScreen={isMobile}>
      <form onSubmit={submit}>
        <Stack>
          <TextInput label="Название" withAsterisk {...form.getInputProps('title')} />
          <TextInput
            label="Ссылка на объявление"
            placeholder="https://www.list.am/item/…"
            description="По ссылке CRM находит дубли"
            {...form.getInputProps('sourceUrl')}
          />

          <SimpleGrid cols={2}>
            <NumberInput
              label="Цена"
              min={0}
              thousandSeparator=" "
              {...form.getInputProps('price')}
            />
            <Select
              label="Валюта"
              data={['USD', 'AMD', 'RUB', 'EUR']}
              allowDeselect={false}
              {...form.getInputProps('currency')}
            />
            <Select
              label="Район"
              data={options('district')}
              clearable
              searchable
              {...form.getInputProps('districtId')}
            />
            <Select
              label="Тип объекта"
              data={options('property_type')}
              clearable
              {...form.getInputProps('propertyTypeId')}
            />
            <NumberInput label="Комнат" min={0} {...form.getInputProps('rooms')} />
            <NumberInput label="Площадь, м²" min={0} {...form.getInputProps('area')} />
            <NumberInput label="Этаж" {...form.getInputProps('floor')} />
            <NumberInput label="Этажей в доме" min={0} {...form.getInputProps('floorsTotal')} />
          </SimpleGrid>

          <TextInput label="Адрес" {...form.getInputProps('address')} />

          <SimpleGrid cols={{ base: 1, xs: 2 }}>
            <TextInput label="Собственник" {...form.getInputProps('ownerName')} />
            <TextInput
              label="Телефон"
              type="tel"
              placeholder="+374 …"
              {...form.getInputProps('phone')}
            />
          </SimpleGrid>
          <TextInput label="Другие контакты" {...form.getInputProps('contactsExtra')} />
          <Textarea label="Описание" autosize minRows={3} {...form.getInputProps('description')} />
          <Text size="xs" c="dimmed">
            Загрузка фото появится вместе с хранилищем файлов.
          </Text>

          {create.error && (
            <Alert color="red">
              {create.error.message}
              {duplicateId !== undefined && (
                <>
                  {' '}
                  <Anchor
                    component="button"
                    type="button"
                    onClick={() => {
                      close();
                      onOpenListing(duplicateId);
                    }}
                  >
                    Открыть карточку
                  </Anchor>
                </>
              )}
            </Alert>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Отмена
            </Button>
            <Button type="submit" loading={create.isPending}>
              Добавить
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
