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
  /** Клиенты, которым предлагали объект (БТ-4.4.2); партнёру — только его клиенты. */
  links: ClientListingLinkDto[];
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
  links: ClientListingLinkDto[];
}

/** Связь клиент ↔ объявление с краткими данными второй стороны (БТ-4.4.2). */
export interface ClientListingLinkDto {
  id: number;
  clientId: number;
  listingId: number;
  status: string;
  showingAt: string | null;
  listing: {
    title: string;
    price: number | null;
    currency: string | null;
    districtId: number | null;
    rooms: number | null;
    coverPhotoId: number | null;
    closed: boolean;
  } | null;
  client: { name: string; phone: string | null } | null;
}

/** Кандидат при автоподборе: объявление для клиента или клиент для объявления. */
export interface MatchDto {
  listing?: ListingDto;
  client?: ClientDto;
  /** Какие критерии совпали — для подсказки в интерфейсе. */
  reasons: string[];
}

export interface DealDto {
  id: number;
  clientId: number | null;
  listingId: number | null;
  finalPrice: number | null;
  commissionFact: number | null;
  currency: string | null;
  closedAt: string | null;
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
