import { can, type ListingDetailsDto, type UserDto } from '@crm/shared';
import {
  ActionIcon,
  Box,
  Button,
  FileButton,
  Group,
  Image,
  Modal,
  SimpleGrid,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconChevronLeft, IconChevronRight, IconPhotoPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useRemovePhoto, useUploadPhotos } from './api';

const MAX_FILES_PER_UPLOAD = 10;

/** Галерея объявления (п. 3.4): превью, просмотр, загрузка с телефона, удаление. */
export function PhotoGallery({ listing, me }: { listing: ListingDetailsDto; me: UserDto }) {
  const uploadPhotos = useUploadPhotos();
  const removePhoto = useRemovePhoto();
  const [viewing, setViewing] = useState<number | null>(null);
  const editable = can.managePhotos(me, { createdById: listing.createdById });
  const photos = listing.photos;

  const onFiles = (files: File[]) => {
    if (files.length === 0) return;
    if (files.length > MAX_FILES_PER_UPLOAD) {
      notifications.show({
        color: 'orange',
        message: `За раз — не больше ${MAX_FILES_PER_UPLOAD} фото`,
      });
      return;
    }
    uploadPhotos.mutate(
      { id: listing.id, files },
      { onError: (e) => notifications.show({ color: 'red', message: e.message }) },
    );
  };

  const current = viewing === null ? null : photos[viewing];

  return (
    <Box>
      {photos.length > 0 && (
        <SimpleGrid cols={{ base: 3, xs: 4 }} spacing={6}>
          {photos.map((photo, index) => (
            <Box key={photo.id} pos="relative">
              <Image
                src={photo.thumbUrl}
                h={84}
                radius="sm"
                fit="cover"
                alt={`Фото ${index + 1}`}
                loading="lazy"
                style={{ cursor: 'zoom-in' }}
                onClick={() => setViewing(index)}
              />
              {editable && (
                <ActionIcon
                  size="sm"
                  color="dark"
                  variant="filled"
                  pos="absolute"
                  top={4}
                  right={4}
                  opacity={0.75}
                  aria-label="Удалить фото"
                  loading={removePhoto.isPending && removePhoto.variables?.photoId === photo.id}
                  onClick={() => removePhoto.mutate({ id: listing.id, photoId: photo.id })}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              )}
            </Box>
          ))}
        </SimpleGrid>
      )}
      {photos.length === 0 && !editable && (
        <Text size="sm" c="dimmed">
          Фото нет
        </Text>
      )}
      {editable && (
        <FileButton onChange={onFiles} accept="image/*" multiple>
          {(props) => (
            <Button
              {...props}
              mt={photos.length ? 'xs' : 0}
              variant="light"
              size="xs"
              leftSection={<IconPhotoPlus size={16} />}
              loading={uploadPhotos.isPending}
            >
              Добавить фото
            </Button>
          )}
        </FileButton>
      )}

      <Modal
        opened={current !== null}
        onClose={() => setViewing(null)}
        size="xl"
        title={viewing !== null ? `Фото ${viewing + 1} из ${photos.length}` : ''}
      >
        {current && viewing !== null && (
          <>
            <Image src={current.url} alt="" radius="sm" fit="contain" mah="70vh" />
            {photos.length > 1 && (
              <Group justify="space-between" mt="sm">
                <ActionIcon
                  variant="default"
                  aria-label="Предыдущее фото"
                  onClick={() => setViewing((viewing - 1 + photos.length) % photos.length)}
                >
                  <IconChevronLeft size={18} />
                </ActionIcon>
                <ActionIcon
                  variant="default"
                  aria-label="Следующее фото"
                  onClick={() => setViewing((viewing + 1) % photos.length)}
                >
                  <IconChevronRight size={18} />
                </ActionIcon>
              </Group>
            )}
          </>
        )}
      </Modal>
    </Box>
  );
}
