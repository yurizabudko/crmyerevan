import {
  checkClientTransition,
  clientTransitionRequirements,
  type ClientDetailsDto,
  type ClientDto,
  type StageDto,
  type UserDto,
} from '@crm/shared';
import {
  Alert,
  Button,
  Checkbox,
  Group,
  List,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { NestedModal } from '../../components/NestedModal';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { yerevanInputToIso } from '../../lib/format';
import { useDictionaries } from '../listings/api';
import { useChangeClientStage, useClient } from './api';

export interface PendingClientMove {
  client: ClientDto | ClientDetailsDto;
  from: StageDto | undefined;
  to: StageDto;
}

const num = (v: number | string) => (v === '' ? undefined : Number(v));

/**
 * Перевод клиента на этап (4.1) с обязательными данными. Поля квалификации заполняются
 * в карточке — окно подскажет, чего не хватает, и откроет редактирование.
 */
export function ClientStageModal({
  move,
  me,
  onClose,
  onEdit,
}: {
  move: PendingClientMove | null;
  me: UserDto;
  onClose: () => void;
  onEdit: (clientId: number) => void;
}) {
  const change = useChangeClientStage();
  const dicts = useDictionaries();
  const [conversation, setConversation] = useState(false);
  const [showingAt, setShowingAt] = useState('');
  const [agreedPrice, setAgreedPrice] = useState<number | string>('');
  const [finalPrice, setFinalPrice] = useState<number | string>('');
  const [commissionFact, setCommissionFact] = useState<number | string>('');
  const [rejectReasonId, setRejectReason] = useState<string | null>(null);
  const [dealListingId, setDealListing] = useState<string | null>(null);

  const req = move ? clientTransitionRequirements(move.from?.code ?? null, move.to.code) : null;
  // Для сделки нужна подборка клиента — на доске её нет, подгружаем карточку.
  const details = useClient(req?.deal && move ? move.client.id : null);
  const links = details.data?.links ?? [];
  const chosen = links.find((l) => l.status === 'chosen');
  const needsInput =
    !!req &&
    (req.conversationConfirmed || req.showingAt || req.agreedPrice || req.deal || req.rejectReason);

  const input = {
    conversationConfirmed: conversation || undefined,
    showingAt: showingAt ? yerevanInputToIso(showingAt) : undefined,
    agreedPrice: num(agreedPrice),
    finalPrice: num(finalPrice),
    commissionFact: num(commissionFact),
    rejectReasonId: rejectReasonId ? Number(rejectReasonId) : undefined,
    dealListingId: dealListingId
      ? Number(dealListingId)
      : req?.deal && chosen
        ? chosen.listingId
        : undefined,
  };
  const client = move?.client;
  const errors =
    move && client
      ? checkClientTransition({
          actor: me,
          from: { code: move.from?.code ?? null, isTerminal: move.from?.isTerminal ?? false },
          to: { code: move.to.code },
          client: {
            budgetMin: client.budgetMin,
            budgetMax: client.budgetMax,
            districtIds: client.districtIds,
            propertyTypeId: client.propertyTypeId,
            timeframe: client.timeframe,
            agreedPrice: client.agreedPrice,
            // На доске количества связей нет — точную проверку сделает сервер.
            linkedListings: 'linkedListings' in client ? client.linkedListings : 1,
          },
          input,
        })
      : [];
  // Ошибки, которые нельзя исправить в этом окне: права, квалификация, связи.
  const blocking = errors.filter((e) =>
    /Партнёр|Владелец|Заполните в карточке|Привяжите|уже на этом/.test(e),
  );

  const close = () => {
    setConversation(false);
    setShowingAt('');
    setAgreedPrice('');
    setFinalPrice('');
    setCommissionFact('');
    setRejectReason(null);
    setDealListing(null);
    change.reset();
    onClose();
  };

  const submit = () => {
    if (!move) return;
    change.mutate(
      {
        id: move.client.id,
        change: { stageId: move.to.id, version: move.client.version, ...input },
      },
      {
        onSuccess: close,
        onError: (error) => {
          if (!(error instanceof ApiError && error.status === 409)) {
            notifications.show({ color: 'red', message: error.message });
          }
          close();
        },
      },
    );
  };

  // Переход без данных и без ошибок — сразу, без окна.
  useEffect(() => {
    if (move && !needsInput && errors.length === 0 && change.isIdle) submit();
  }, [move]);

  const opened = move !== null && (needsInput || errors.length > 0);

  return (
    <NestedModal
      opened={opened}
      onClose={close}
      title={move ? `Перевод на этап «${move.to.name}»` : ''}
    >
      {move && req && (
        <Stack>
          <Text size="sm" fw={500}>
            {move.client.name}
          </Text>
          {blocking.length === 0 && (
            <>
              {req.conversationConfirmed && (
                <Checkbox
                  label="Первый разговор с клиентом состоялся"
                  checked={conversation}
                  onChange={(e) => setConversation(e.currentTarget.checked)}
                />
              )}
              {req.showingAt && (
                <TextInput
                  label="Дата и время показа"
                  description="Время Еревана"
                  type="datetime-local"
                  value={showingAt}
                  onChange={(e) => setShowingAt(e.currentTarget.value)}
                />
              )}
              {req.agreedPrice && (
                <NumberInput
                  label="Согласованная цена"
                  min={0}
                  thousandSeparator=" "
                  placeholder={move.client.agreedPrice?.toString()}
                  value={agreedPrice}
                  onChange={setAgreedPrice}
                />
              )}
              {req.deal && (
                <Select
                  label="Объект сделки"
                  description="Из подборки клиента; объект закроется автоматически"
                  data={links
                    .filter((l) => l.listing && !l.listing.closed)
                    .map((l) => ({ value: String(l.listingId), label: l.listing!.title }))}
                  value={dealListingId ?? (chosen ? String(chosen.listingId) : null)}
                  onChange={setDealListing}
                  nothingFoundMessage="Подборка пуста"
                />
              )}
              {req.deal && (
                <SimpleGrid cols={2}>
                  <NumberInput
                    label="Финальная цена"
                    min={0}
                    thousandSeparator=" "
                    value={finalPrice}
                    onChange={setFinalPrice}
                  />
                  <NumberInput
                    label="Комиссия (факт)"
                    min={0}
                    thousandSeparator=" "
                    value={commissionFact}
                    onChange={setCommissionFact}
                  />
                </SimpleGrid>
              )}
              {req.rejectReason && (
                <Select
                  label="Причина отказа"
                  data={(dicts.data?.reject_reason ?? []).map((d) => ({
                    value: String(d.id),
                    label: d.name,
                  }))}
                  value={rejectReasonId}
                  onChange={setRejectReason}
                />
              )}
            </>
          )}
          {errors.length > 0 && (
            <Alert color={blocking.length > 0 ? 'red' : 'gray'} variant="light">
              <List size="sm">
                {(blocking.length > 0 ? blocking : errors).map((e) => (
                  <List.Item key={e}>{e}</List.Item>
                ))}
              </List>
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              Отмена
            </Button>
            {blocking.some((e) => e.startsWith('Заполните')) && (
              <Button
                variant="light"
                onClick={() => {
                  const id = move.client.id;
                  close();
                  onEdit(id);
                }}
              >
                Заполнить карточку
              </Button>
            )}
            {blocking.length === 0 && (
              <Button onClick={submit} disabled={errors.length > 0} loading={change.isPending}>
                Перевести
              </Button>
            )}
          </Group>
        </Stack>
      )}
    </NestedModal>
  );
}
