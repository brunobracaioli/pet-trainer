// @generated
// This file is overwritten by `pnpm db:types` (supabase gen types typescript --local).
// Do NOT edit by hand. Regenerate after every migration change.
// Until the supabase CLI is installed locally, this stub is a hand-authored
// placeholder that mirrors supabase/migrations/20260429000001_schema.sql so that
// @specops/domain typechecks before the first regeneration.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          github_login: string
          avatar_url: string | null
          created_at: string | null
          preferences: Json
        }
        Insert: {
          id: string
          username: string
          github_login: string
          avatar_url?: string | null
          created_at?: string | null
          preferences?: Json
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      pets: {
        Row: {
          id: string
          owner_id: string
          name: string
          species: string
          stage: number
          xp: number
          hunger: number
          energy: number
          happiness: number
          last_seen_at: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          owner_id: string
          name: string
          species?: string
          stage?: number
          xp?: number
          hunger?: number
          energy?: number
          happiness?: number
          last_seen_at?: string | null
          created_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['pets']['Insert']>
      }
      quests: {
        Row: {
          id: string
          title: string
          description: string
          difficulty: number
          xp_reward: number
          required_tool: string | null
          match_rule: Json
          category: string
          unlocks_after: string[]
          is_active: boolean
          created_at: string | null
        }
        Insert: {
          id: string
          title: string
          description: string
          difficulty: number
          xp_reward: number
          required_tool?: string | null
          match_rule: Json
          category: string
          unlocks_after?: string[]
          is_active?: boolean
          created_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['quests']['Insert']>
      }
      quest_progress: {
        Row: {
          user_id: string
          quest_id: string
          status: 'locked' | 'available' | 'in_progress' | 'completed'
          started_at: string | null
          completed_at: string | null
          evidence: Json | null
        }
        Insert: {
          user_id: string
          quest_id: string
          status: 'locked' | 'available' | 'in_progress' | 'completed'
          started_at?: string | null
          completed_at?: string | null
          evidence?: Json | null
        }
        Update: Partial<Database['public']['Tables']['quest_progress']['Insert']>
      }
      events: {
        Row: {
          id: number
          user_id: string
          session_id: string
          event_type: string
          tool_name: string | null
          payload: Json
          ingested_at: string
          idempotency_key: string
        }
        Insert: {
          id?: number
          user_id: string
          session_id: string
          event_type: string
          tool_name?: string | null
          payload: Json
          ingested_at?: string
          idempotency_key: string
        }
        Update: Partial<Database['public']['Tables']['events']['Insert']>
      }
      xp_ledger: {
        Row: {
          id: number
          user_id: string
          delta: number
          reason: string
          ref_id: string | null
          created_at: string
        }
        Insert: {
          id?: number
          user_id: string
          delta: number
          reason: string
          ref_id?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['xp_ledger']['Insert']>
      }
      leaderboard_snapshots: {
        Row: {
          id: number
          period: string
          snapshot: Json
          created_at: string
        }
        Insert: {
          id?: number
          period: string
          snapshot: Json
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['leaderboard_snapshots']['Insert']>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
