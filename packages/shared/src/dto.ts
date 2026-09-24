import type { DictionaryKind } from './dictionaries.js';
import type { Actor } from './permissions.js';
import type { UserStatus } from './roles.js';

/** Контракты ответов API — общие для бэкенда и фронтенда. */

export interface UserDto extends Actor {
  login: string;
  displayName: string;
  status: UserStatus;
  mustChangePassword: boolean;
  createdById: number | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface StageDto {
  id: number;
  code: string;
  name: string;
  position: number;
  isSystem: boolean;
  isTerminal: boolean;
}

export interface ListingDto {
  id: number;
  title: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  districtId: number | null;
  propertyTypeId: number | null;
  rooms: number | null;
  floor: number | null;
  floorsTotal: number | null;
  area: number | null;
  address: string | null;
  ownerName: string | null;
  phone: string | null;
  contactsExtra: string | null;
  source: 'parser' | 'manual';
  sourceUrl: string | null;
  stageId: number | null;
  responsibleId: number | null;
  partnerSourceId: number | null;
  createdById: number | null;
  meetingAt: string | null;
  closeOutcome: string | null;
  commissionPercent: number | null;
  lastActivityAt: string | null;
  coverPhotoId: number | null;
  createdAt: string;
  version: number;
}

export interface PhotoDto {
  id: number;
  url: string;
  thumbUrl: string;
  width: number | null;
  height: number | null;
}

export type CommentKind = 'manual' | 'call' | 'system';

export interface CommentDto {
  id: number;
  kind: CommentKind;
  authorId: number | null;
  authorName: string | null;
  body: string | null;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

export interface ListingBoardDto {
  stages: StageDto[];
  cards: ListingDto[];
}

export interface ListingDetailsDto extends ListingDto {
  comments: CommentDto[];
  photos: PhotoDto[];
}

export interface DictionaryItemDto {
  id: number;
  code: string;
  name: string;
}

export type DictionariesDto = Record<DictionaryKind, DictionaryItemDto[]>;

export interface ClientDto {
  id: number;
  name: string;
  phone: string | null;
  messenger: string | null;
  sourceId: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string | null;
  districtIds: number[];
  propertyTypeId: number | null;
  roomsMin: number | null;
  roomsMax: number | null;
  floorPreference: string | null;
  timeframe: string | null;
  notes: string | null;
  stageId: number | null;
  responsibleId: number | null;
  partnerSourceId: number | null;
  createdById: number | null;
  agreedPrice: number | null;
  finalPrice: number | null;
  commissionFact: number | null;
  rejectReasonId: number | null;
  showingsCount: number;
  nextShowingAt: string | null;
  lastActivityAt: string | null;
  /** Этапы 1–3 без активности больше 48 часов (БТ-4.2.1). */
  isOverdue: boolean;
  createdAt: string;
  version: number;
}

export interface ClientBoardDto {
  stages: StageDto[];
  cards: ClientDto[];
}

export interface ClientDetailsDto extends ClientDto {
  comments: CommentDto[];
  linkedListings: number;
}

/** Краткие данные пользователя для списков выбора и подписей. */
export interface UserBriefDto {
  id: number;
  displayName: string;
  role: UserDto['role'];
  status: UserDto['status'];
}

/** Тело ошибки API. */
export interface ApiErrorBody {
  statusCode?: number;
  message?: string | string[];
  code?: string;
  issues?: { path: string; message: string }[];
  existingId?: number;
  errors?: string[];
}
