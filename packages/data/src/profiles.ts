import type { AvatarCrop, Profile, UserPlatform } from '@clube-do-jogo/domain';
import type { DataScope } from './client';

export type ProfilePatch = Partial<Pick<Profile, 'name' | 'bio' | 'avatar_url' | 'avatar_crop'>>;

export interface ProfileUpdateInput extends DataScope {
  patch: ProfilePatch;
}

export interface PlatformSearchQuery extends DataScope {
  query: string;
}

export interface UserPlatformInput {
  igdb_platform_id: number;
  name: string;
  abbreviation?: string | null;
  logo_url?: string | null;
}

export interface UserPlatformMutation extends DataScope {
  platform: UserPlatformInput;
}

export interface UserPlatformRemoval extends DataScope {
  igdbPlatformId: number;
}

export type { AvatarCrop, Profile, UserPlatform };
