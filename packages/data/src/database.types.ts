/**
 * Tipos do banco do Clube do Jogo (schema public), no formato de
 * `supabase gen types typescript`.
 *
 * ARQUIVO GERADO. Não edite à mão: rode `scripts/generate-database-types.sh`.
 *
 * Origem: derivado SOMENTE do SQL versionado neste repositório, aplicado a um
 * Postgres 17 descartável e local (socket Unix, sem TCP), e lido pelo
 * postgres-meta v0.96.6 (o mesmo da Supabase CLI 2.111.0).
 * NÃO foi introspectado do projeto Supabase de produção. Se a produção tiver
 * recebido SQL que não está no repositório, este arquivo não reflete isso.
 *
 * Gerado em: 2026-11-25
 *
 * Arquivos aplicados, nesta ordem (seed:* são dados fictícios mínimos para que
 * as migrations de recompensa, que só gravam dados, passem nas próprias checagens):
 *   schema.sql
 *   migration_remove_vote_month.sql
 *   migration_add_completed_games.sql
 *   migration_add_game_rating_release_year.sql
 *   migration_add_igdb_id.sql
 *   migration_monthly_club.sql
 *   migration_add_game_taxonomy.sql
 *   migration_add_user_platforms.sql
 *   migration_admin_cycles_game_data.sql
 *   migration_rewards.sql
 *   seed:cycle-2026-07
 *   migration_reward_ori.sql
 *   migration_detailed_ratings.sql
 *   migration_timeline_realtime.sql
 *   migration_rating_scale_0_to_10.sql
 *   migration_push_notifications.sql
 *   migration_preferences_favorites.sql
 *   supabase/migrations/20260801150000_rating_scale_preferences.sql
 *   seed:cycle-2026-08
 *   supabase/migrations/20260829160000_cosmic_campfire_reward.sql
 *   supabase/migrations/20260829164500_reward_eligibility.sql
 *   migration_push_notification_events.sql
 *   migration_user_platforms_visibility.sql
 *   migration_avatar_crop.sql
 *   supabase/migrations/20260910143000_native_push_delivery.sql
 *   supabase/migrations/20261027090000_vote_threshold_notifications.sql
 *   supabase/migrations/20261123120000_votes_update_policy.sql
 *   supabase/migrations/20261123180000_goty_2026_experience.sql
 *   supabase/migrations/20261123200000_neutral_vote_choice.sql
 *
 * Antes deles, um stub mínimo da Supabase: roles anon/authenticated/service_role,
 * schema auth (auth.users, auth.uid(), auth.role(), auth.jwt()), extensões
 * uuid-ossp e pgcrypto no schema extensions e a publicação supabase_realtime.
 * O stub não cria nada em public.
 *
 * Para regenerar: scripts/generate-database-types.sh
 * Para conferir sem gravar: scripts/generate-database-types.sh --check
 * (requer node, npm, git e psql; baixa as versões fixadas no script.)
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      backlogs: {
        Row: {
          created_at: string
          game_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "backlogs_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      club_comments: {
        Row: {
          body: string
          club_month: string
          created_at: string
          game_id: string
          id: string
          parent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          club_month: string
          created_at?: string
          game_id: string
          id?: string
          parent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          club_month?: string
          created_at?: string
          game_id?: string
          id?: string
          parent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_comments_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "club_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      club_cycle_events: {
        Row: {
          action: string
          created_at: string
          cycle_month: string
          game_id: string
          id: string
          performed_by: string
          previous_game_id: string | null
          redo_invalidated_at: string | null
          reverted_at: string | null
          reverted_by: string | null
        }
        Insert: {
          action: string
          created_at?: string
          cycle_month: string
          game_id: string
          id?: string
          performed_by: string
          previous_game_id?: string | null
          redo_invalidated_at?: string | null
          reverted_at?: string | null
          reverted_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          cycle_month?: string
          game_id?: string
          id?: string
          performed_by?: string
          previous_game_id?: string | null
          redo_invalidated_at?: string | null
          reverted_at?: string | null
          reverted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_cycle_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_cycle_events_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_cycle_events_previous_game_id_fkey"
            columns: ["previous_game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_cycle_events_reverted_by_fkey"
            columns: ["reverted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_months: {
        Row: {
          closed_at: string | null
          created_at: string
          finalized_at: string
          game_id: string
          month: string
          selected_by: string | null
          started_at: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          finalized_at?: string
          game_id: string
          month: string
          selected_by?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          finalized_at?: string
          game_id?: string
          month?: string
          selected_by?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_months_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_months_selected_by_fkey"
            columns: ["selected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_months_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_rewards: {
        Row: {
          club_month: string
          code: string
          created_at: string
          description: string | null
          eligibility: string
          id: string
          image_url: string | null
          kind: string
          name: string
          theme_id: string | null
        }
        Insert: {
          club_month: string
          code: string
          created_at?: string
          description?: string | null
          eligibility?: string
          id?: string
          image_url?: string | null
          kind: string
          name: string
          theme_id?: string | null
        }
        Update: {
          club_month?: string
          code?: string
          created_at?: string
          description?: string | null
          eligibility?: string
          id?: string
          image_url?: string | null
          kind?: string
          name?: string
          theme_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "club_rewards_club_month_fkey"
            columns: ["club_month"]
            isOneToOne: false
            referencedRelation: "club_months"
            referencedColumns: ["month"]
          },
        ]
      }
      comment_reactions: {
        Row: {
          club_month: string
          comment_id: string
          created_at: string
          emoji: string
          game_id: string
          id: string
          user_id: string
        }
        Insert: {
          club_month: string
          comment_id: string
          created_at?: string
          emoji: string
          game_id: string
          id?: string
          user_id: string
        }
        Update: {
          club_month?: string
          comment_id?: string
          created_at?: string
          emoji?: string
          game_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "club_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reactions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      completed_games: {
        Row: {
          created_at: string
          game_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "completed_games_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      cycle_note_snapshots: {
        Row: {
          body: string
          captured_at: string
          created_at: string
          cycle_month: string
          game_id: string
          image_data_url: string | null
          note_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          captured_at?: string
          created_at: string
          cycle_month: string
          game_id: string
          image_data_url?: string | null
          note_id: string
          updated_at: string
          user_id: string
        }
        Update: {
          body?: string
          captured_at?: string
          created_at?: string
          cycle_month?: string
          game_id?: string
          image_data_url?: string | null
          note_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cycle_note_snapshots_cycle_month_fkey"
            columns: ["cycle_month"]
            isOneToOne: false
            referencedRelation: "club_months"
            referencedColumns: ["month"]
          },
          {
            foreignKeyName: "cycle_note_snapshots_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      cycle_progress_snapshots: {
        Row: {
          captured_at: string
          cycle_month: string
          finished_at: string | null
          game_id: string
          id: string
          rating: number | null
          rating_details: Json | null
          rating_mode: string
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          captured_at?: string
          cycle_month: string
          finished_at?: string | null
          game_id: string
          id?: string
          rating?: number | null
          rating_details?: Json | null
          rating_mode?: string
          started_at?: string | null
          status: string
          user_id: string
        }
        Update: {
          captured_at?: string
          cycle_month?: string
          finished_at?: string | null
          game_id?: string
          id?: string
          rating?: number | null
          rating_details?: Json | null
          rating_mode?: string
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cycle_progress_snapshots_cycle_month_fkey"
            columns: ["cycle_month"]
            isOneToOne: false
            referencedRelation: "club_months"
            referencedColumns: ["month"]
          },
          {
            foreignKeyName: "cycle_progress_snapshots_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_progress_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favorite_games: {
        Row: {
          created_at: string
          game_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorite_games_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_notes: {
        Row: {
          body: string
          created_at: string
          game_id: string
          id: string
          image_data_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          game_id: string
          id?: string
          image_data_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          game_id?: string
          id?: string
          image_data_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_notes_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_progress: {
        Row: {
          finished_at: string | null
          game_id: string
          id: string
          rating: number | null
          rating_details: Json | null
          rating_mode: string
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          finished_at?: string | null
          game_id: string
          id?: string
          rating?: number | null
          rating_details?: Json | null
          rating_mode?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          finished_at?: string | null
          game_id?: string
          id?: string
          rating?: number | null
          rating_details?: Json | null
          rating_mode?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_progress_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          average_rating: number | null
          created_at: string
          description: string | null
          duration_hours: number
          genres: string[] | null
          id: string
          igdb_id: number | null
          image_url: string | null
          platform_ids: number[]
          platforms: string[] | null
          release_year: number | null
          screenshot_urls: string[] | null
          title: string
          trailer_url: string | null
          winner_month: string | null
        }
        Insert: {
          average_rating?: number | null
          created_at?: string
          description?: string | null
          duration_hours: number
          genres?: string[] | null
          id?: string
          igdb_id?: number | null
          image_url?: string | null
          platform_ids?: number[]
          platforms?: string[] | null
          release_year?: number | null
          screenshot_urls?: string[] | null
          title: string
          trailer_url?: string | null
          winner_month?: string | null
        }
        Update: {
          average_rating?: number | null
          created_at?: string
          description?: string | null
          duration_hours?: number
          genres?: string[] | null
          id?: string
          igdb_id?: number | null
          image_url?: string | null
          platform_ids?: number[]
          platforms?: string[] | null
          release_year?: number | null
          screenshot_urls?: string[] | null
          title?: string
          trailer_url?: string | null
          winner_month?: string | null
        }
        Relationships: []
      }
      goty_bolao_submissions: {
        Row: {
          confirmed_at: string | null
          created_at: string
          edition_year: number
          updated_at: string
          user_id: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          edition_year: number
          updated_at?: string
          user_id: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          edition_year?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goty_bolao_submissions_edition_year_fkey"
            columns: ["edition_year"]
            isOneToOne: false
            referencedRelation: "goty_events"
            referencedColumns: ["edition_year"]
          },
          {
            foreignKeyName: "goty_bolao_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goty_bolao_votes: {
        Row: {
          category_id: string
          created_at: string
          edition_year: number
          id: string
          nominee_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          edition_year: number
          id?: string
          nominee_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          edition_year?: number
          id?: string
          nominee_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goty_bolao_votes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "goty_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goty_bolao_votes_edition_year_fkey"
            columns: ["edition_year"]
            isOneToOne: false
            referencedRelation: "goty_events"
            referencedColumns: ["edition_year"]
          },
          {
            foreignKeyName: "goty_bolao_votes_nominee_id_fkey"
            columns: ["nominee_id"]
            isOneToOne: false
            referencedRelation: "goty_nominees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goty_bolao_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goty_categories: {
        Row: {
          created_at: string
          description: string
          display_order: number
          edition_year: number
          id: string
          name: string
          name_pt: string
          section: string
          slug: string
          winner_nominee_id: string | null
          winner_set_at: string | null
          winner_set_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string
          display_order: number
          edition_year: number
          id: string
          name: string
          name_pt: string
          section?: string
          slug: string
          winner_nominee_id?: string | null
          winner_set_at?: string | null
          winner_set_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          display_order?: number
          edition_year?: number
          id?: string
          name?: string
          name_pt?: string
          section?: string
          slug?: string
          winner_nominee_id?: string | null
          winner_set_at?: string | null
          winner_set_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goty_categories_edition_year_fkey"
            columns: ["edition_year"]
            isOneToOne: false
            referencedRelation: "goty_events"
            referencedColumns: ["edition_year"]
          },
          {
            foreignKeyName: "goty_categories_winner_nominee_fk"
            columns: ["winner_nominee_id"]
            isOneToOne: false
            referencedRelation: "goty_nominees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goty_categories_winner_set_by_fkey"
            columns: ["winner_set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goty_events: {
        Row: {
          ceremony_at: string | null
          created_at: string
          edition_year: number
          personal_voting_open: boolean
          source_name: string
          source_url: string
          source_verified_at: string | null
          status: string
          subtitle: string
          title: string
          updated_at: string
          voting_closes_at: string | null
          voting_opens_at: string | null
        }
        Insert: {
          ceremony_at?: string | null
          created_at?: string
          edition_year: number
          personal_voting_open?: boolean
          source_name: string
          source_url: string
          source_verified_at?: string | null
          status?: string
          subtitle: string
          title: string
          updated_at?: string
          voting_closes_at?: string | null
          voting_opens_at?: string | null
        }
        Update: {
          ceremony_at?: string | null
          created_at?: string
          edition_year?: number
          personal_voting_open?: boolean
          source_name?: string
          source_url?: string
          source_verified_at?: string | null
          status?: string
          subtitle?: string
          title?: string
          updated_at?: string
          voting_closes_at?: string | null
          voting_opens_at?: string | null
        }
        Relationships: []
      }
      goty_nominees: {
        Row: {
          category_id: string
          created_at: string
          display_order: number
          edition_year: number
          game_id: string | null
          game_query: string | null
          id: string
          igdb_id: number | null
          image_url: string | null
          nominee_kind: string
          slug: string
          subtitle: string | null
          title: string
        }
        Insert: {
          category_id: string
          created_at?: string
          display_order: number
          edition_year: number
          game_id?: string | null
          game_query?: string | null
          id: string
          igdb_id?: number | null
          image_url?: string | null
          nominee_kind?: string
          slug: string
          subtitle?: string | null
          title: string
        }
        Update: {
          category_id?: string
          created_at?: string
          display_order?: number
          edition_year?: number
          game_id?: string | null
          game_query?: string | null
          id?: string
          igdb_id?: number | null
          image_url?: string | null
          nominee_kind?: string
          slug?: string
          subtitle?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "goty_nominees_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "goty_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goty_nominees_edition_year_fkey"
            columns: ["edition_year"]
            isOneToOne: false
            referencedRelation: "goty_events"
            referencedColumns: ["edition_year"]
          },
          {
            foreignKeyName: "goty_nominees_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      goty_personal_categories: {
        Row: {
          created_at: string
          description: string
          display_order: number
          edition_year: number
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string
          display_order: number
          edition_year: number
          id: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string
          display_order?: number
          edition_year?: number
          id?: string
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "goty_personal_categories_edition_year_fkey"
            columns: ["edition_year"]
            isOneToOne: false
            referencedRelation: "goty_events"
            referencedColumns: ["edition_year"]
          },
        ]
      }
      goty_personal_picks: {
        Row: {
          category_id: string
          created_at: string
          edition_year: number
          game_genres: string[]
          game_id: string | null
          game_image_url: string | null
          game_platforms: string[]
          game_release_year: number | null
          game_title: string
          id: string
          igdb_id: number | null
          release_eligibility: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          edition_year: number
          game_genres?: string[]
          game_id?: string | null
          game_image_url?: string | null
          game_platforms?: string[]
          game_release_year?: number | null
          game_title: string
          id?: string
          igdb_id?: number | null
          release_eligibility?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          edition_year?: number
          game_genres?: string[]
          game_id?: string | null
          game_image_url?: string | null
          game_platforms?: string[]
          game_release_year?: number | null
          game_title?: string
          id?: string
          igdb_id?: number | null
          release_eligibility?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goty_personal_picks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "goty_personal_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goty_personal_picks_edition_year_fkey"
            columns: ["edition_year"]
            isOneToOne: false
            referencedRelation: "goty_events"
            referencedColumns: ["edition_year"]
          },
          {
            foreignKeyName: "goty_personal_picks_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goty_personal_picks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      native_push_attempts: {
        Row: {
          attempt_number: number
          delivery_id: string
          error_code: string | null
          error_message: string | null
          expo_push_token: string
          finished_at: string | null
          id: string
          raw_receipt: Json | null
          raw_ticket: Json | null
          receipt_outcome: string | null
          send_outcome: string
          started_at: string
          ticket_id: string | null
          uncertain: boolean
          worker_id: string
        }
        Insert: {
          attempt_number: number
          delivery_id: string
          error_code?: string | null
          error_message?: string | null
          expo_push_token: string
          finished_at?: string | null
          id?: string
          raw_receipt?: Json | null
          raw_ticket?: Json | null
          receipt_outcome?: string | null
          send_outcome?: string
          started_at?: string
          ticket_id?: string | null
          uncertain?: boolean
          worker_id: string
        }
        Update: {
          attempt_number?: number
          delivery_id?: string
          error_code?: string | null
          error_message?: string | null
          expo_push_token?: string
          finished_at?: string | null
          id?: string
          raw_receipt?: Json | null
          raw_ticket?: Json | null
          receipt_outcome?: string | null
          send_outcome?: string
          started_at?: string
          ticket_id?: string | null
          uncertain?: boolean
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "native_push_attempts_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "native_push_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      native_push_deliveries: {
        Row: {
          attempt_count: number
          channel: string
          created_at: string
          delivered_at: string | null
          event_key: string
          id: string
          installation_id: string
          last_error_code: string | null
          last_error_message: string | null
          lease_expires_at: string | null
          lease_id: string | null
          message: Json
          next_attempt_at: string
          project_id: string
          receipt_attempt_count: number
          recipient_user_id: string
          status: string
          ticket_attempt_id: string | null
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          channel?: string
          created_at?: string
          delivered_at?: string | null
          event_key: string
          id?: string
          installation_id: string
          last_error_code?: string | null
          last_error_message?: string | null
          lease_expires_at?: string | null
          lease_id?: string | null
          message: Json
          next_attempt_at?: string
          project_id: string
          receipt_attempt_count?: number
          recipient_user_id: string
          status?: string
          ticket_attempt_id?: string | null
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          channel?: string
          created_at?: string
          delivered_at?: string | null
          event_key?: string
          id?: string
          installation_id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          lease_expires_at?: string | null
          lease_id?: string | null
          message?: Json
          next_attempt_at?: string
          project_id?: string
          receipt_attempt_count?: number
          recipient_user_id?: string
          status?: string
          ticket_attempt_id?: string | null
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "native_push_deliveries_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "native_push_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "native_push_deliveries_ticket_attempt_fk"
            columns: ["ticket_attempt_id"]
            isOneToOne: false
            referencedRelation: "native_push_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      native_push_installations: {
        Row: {
          active: boolean
          created_at: string
          expo_push_token: string
          id: string
          installation_id: string
          linked_at: string
          platform: string
          project_id: string
          unlinked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          expo_push_token: string
          id?: string
          installation_id: string
          linked_at?: string
          platform: string
          project_id: string
          unlinked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          expo_push_token?: string
          id?: string
          installation_id?: string
          linked_at?: string
          platform?: string
          project_id?: string
          unlinked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_crop: Json | null
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string | null
          updated_at: string
        }
        Insert: {
          avatar_crop?: Json | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          email?: string | null
          id: string
          name?: string | null
          updated_at?: string
        }
        Update: {
          avatar_crop?: Json | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_notification_deliveries: {
        Row: {
          created_at: string
          event_key: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_key: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_key?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      push_notification_states: {
        Row: {
          state_key: string
          updated_at: string
          value_uuid: string | null
        }
        Insert: {
          state_key: string
          updated_at?: string
          value_uuid?: string | null
        }
        Update: {
          state_key?: string
          updated_at?: string
          value_uuid?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ranking_snapshots: {
        Row: {
          completed_count: number
          completed_user_ids: string[]
          finalized_at: string
          game_id: string
          legacy_total_points: number | null
          neutral_count: number
          neutral_user_ids: string[]
          playtime_points: number
          position: number
          rating_multiplier: number
          target_month: string
          total_points: number
          unavailable_count: number
          unavailable_user_ids: string[]
          vote_count: number
          voter_ids: string[]
          voting_month: string
          would_not_play_count: number
          would_not_play_user_ids: string[]
          would_play_count: number
          would_play_user_ids: string[]
        }
        Insert: {
          completed_count?: number
          completed_user_ids?: string[]
          finalized_at?: string
          game_id: string
          legacy_total_points?: number | null
          neutral_count?: number
          neutral_user_ids?: string[]
          playtime_points: number
          position: number
          rating_multiplier: number
          target_month: string
          total_points: number
          unavailable_count?: number
          unavailable_user_ids?: string[]
          vote_count?: number
          voter_ids?: string[]
          voting_month: string
          would_not_play_count?: number
          would_not_play_user_ids?: string[]
          would_play_count?: number
          would_play_user_ids?: string[]
        }
        Update: {
          completed_count?: number
          completed_user_ids?: string[]
          finalized_at?: string
          game_id?: string
          legacy_total_points?: number | null
          neutral_count?: number
          neutral_user_ids?: string[]
          playtime_points?: number
          position?: number
          rating_multiplier?: number
          target_month?: string
          total_points?: number
          unavailable_count?: number
          unavailable_user_ids?: string[]
          vote_count?: number
          voter_ids?: string[]
          voting_month?: string
          would_not_play_count?: number
          would_not_play_user_ids?: string[]
          would_play_count?: number
          would_play_user_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "ranking_snapshots_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      role_events: {
        Row: {
          changed_by: string
          created_at: string
          id: string
          new_role: string
          previous_role: string
          target_user_id: string
        }
        Insert: {
          changed_by: string
          created_at?: string
          id?: string
          new_role: string
          previous_role: string
          target_user_id: string
        }
        Update: {
          changed_by?: string
          created_at?: string
          id?: string
          new_role?: string
          previous_role?: string
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_events_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_events_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_platforms: {
        Row: {
          abbreviation: string | null
          created_at: string
          id: string
          igdb_platform_id: number
          logo_url: string | null
          name: string
          user_id: string
        }
        Insert: {
          abbreviation?: string | null
          created_at?: string
          id?: string
          igdb_platform_id: number
          logo_url?: string | null
          name: string
          user_id: string
        }
        Update: {
          abbreviation?: string | null
          created_at?: string
          id?: string
          igdb_platform_id?: number
          logo_url?: string | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      user_reward_grants: {
        Row: {
          granted_at: string
          id: string
          reward_id: string
          seen_at: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          id?: string
          reward_id: string
          seen_at?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          id?: string
          reward_id?: string
          seen_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_reward_grants_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "club_rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reward_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          role: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          role?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          role?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vote_threshold_notification_states: {
        Row: {
          notification_open: boolean
          notification_sequence: number
          notified_at: string | null
          opened_at: string | null
          updated_at: string
          user_id: string
          vote_month: string
        }
        Insert: {
          notification_open?: boolean
          notification_sequence?: number
          notified_at?: string | null
          opened_at?: string | null
          updated_at?: string
          user_id: string
          vote_month: string
        }
        Update: {
          notification_open?: boolean
          notification_sequence?: number
          notified_at?: string | null
          opened_at?: string | null
          updated_at?: string
          user_id?: string
          vote_month?: string
        }
        Relationships: []
      }
      votes: {
        Row: {
          choice: string
          created_at: string
          game_id: string
          id: string
          reason: string | null
          reason_text: string | null
          user_id: string
          vote_month: string
        }
        Insert: {
          choice?: string
          created_at?: string
          game_id: string
          id?: string
          reason?: string | null
          reason_text?: string | null
          user_id: string
          vote_month: string
        }
        Update: {
          choice?: string
          created_at?: string
          game_id?: string
          id?: string
          reason?: string | null
          reason_text?: string | null
          user_id?: string
          vote_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "votes_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acknowledge_reward_grant: {
        Args: { target_grant_id: string }
        Returns: undefined
      }
      claim_native_push_deliveries: {
        Args: { target_limit: number; target_worker_id: string }
        Returns: {
          attempt_id: string
          attempt_number: number
          delivery_id: string
          expo_push_token: string
          installation_id: string
          message: Json
          project_id: string
        }[]
      }
      claim_native_push_receipts: {
        Args: { target_limit: number; target_worker_id: string }
        Returns: {
          attempt_id: string
          delivery_id: string
          expo_push_token: string
          installation_id: string
          receipt_attempt_number: number
          ticket_id: string
        }[]
      }
      claim_ranking_leader_notification: {
        Args: {
          expected_previous_leader_id: string
          new_leader_id: string
          target_vote_month: string
        }
        Returns: boolean
      }
      claim_vote_threshold_notifications: {
        Args: { source_user_id: string; target_vote_month: string }
        Returns: {
          notification_sequence: number
          recipient_user_id: string
        }[]
      }
      complete_vote_threshold_notification: {
        Args: { target_vote_month: string }
        Returns: boolean
      }
      enqueue_native_push_deliveries: {
        Args: {
          excluded_user_id?: string
          target_event_key: string
          target_message: Json
          target_project_id: string
          target_user_ids?: string[]
        }
        Returns: number
      }
      finalize_closed_club_months: { Args: never; Returns: undefined }
      freeze_cycle_game_state: {
        Args: { snapshot_cycle: string; snapshot_game_id: string }
        Returns: undefined
      }
      freeze_cycle_ranking: {
        Args: { target_cycle: string; voting_cycle: string }
        Returns: undefined
      }
      get_club_game_undo_preview: {
        Args: { change_event_id: string }
        Returns: Json
      }
      is_admin: { Args: { check_user_id?: string }; Returns: boolean }
      is_goty_bolao_open: {
        Args: { check_edition_year: number }
        Returns: boolean
      }
      is_goty_personal_open: {
        Args: { check_edition_year: number }
        Returns: boolean
      }
      open_vote_threshold_notification: {
        Args: { target_vote_month: string }
        Returns: boolean
      }
      record_native_push_receipt: {
        Args: {
          target_attempt_id: string
          target_delivery_id: string
          target_error_code: string
          target_error_message: string
          target_expo_push_token: string
          target_raw: Json
          target_retry_at: string
          target_status: string
          target_worker_id: string
        }
        Returns: boolean
      }
      record_native_push_ticket: {
        Args: {
          target_attempt_id: string
          target_delivery_id: string
          target_error_code: string
          target_error_message: string
          target_expo_push_token: string
          target_raw: Json
          target_retry_at: string
          target_status: string
          target_ticket_id: string
          target_uncertain: boolean
          target_worker_id: string
        }
        Returns: boolean
      }
      redo_club_game_change: {
        Args: { change_event_id: string }
        Returns: Json
      }
      register_native_push_installation: {
        Args: {
          target_expo_push_token: string
          target_installation_id: string
          target_platform: string
          target_project_id: string
        }
        Returns: Json
      }
      set_club_game: {
        Args: { mode: string; selected_game_id: string }
        Returns: Json
      }
      set_goty_category_winner: {
        Args: { target_category_id: string; target_winner_nominee_id?: string }
        Returns: undefined
      }
      set_goty_event_settings: {
        Args: {
          clear_voting_closes_at?: boolean
          next_personal_voting_open?: boolean
          next_status?: string
          next_voting_closes_at?: string
          target_edition_year: number
        }
        Returns: {
          ceremony_at: string | null
          created_at: string
          edition_year: number
          personal_voting_open: boolean
          source_name: string
          source_url: string
          source_verified_at: string | null
          status: string
          subtitle: string
          title: string
          updated_at: string
          voting_closes_at: string | null
          voting_opens_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "goty_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_user_role: {
        Args: { new_role: string; target_user_id: string }
        Returns: undefined
      }
      undo_club_game_change: {
        Args: { change_event_id: string; force_delete?: boolean }
        Returns: Json
      }
      unlink_native_push_installation: {
        Args: {
          expected_expo_push_token: string
          target_installation_id: string
        }
        Returns: boolean
      }
      update_goty_nominee_cover: {
        Args: {
          next_game_id?: string
          next_igdb_id?: number
          next_image_url: string
          target_nominee_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
