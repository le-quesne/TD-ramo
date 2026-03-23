export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string
          role: 'driver' | 'admin'
          created_at: string
        }
        Insert: {
          id: string
          email: string
          full_name: string
          role?: 'driver' | 'admin'
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          role?: 'driver' | 'admin'
          created_at?: string
        }
      }
      drivers: {
        Row: {
          id: string
          status: 'stopped' | 'driving'
          current_lat: number | null
          current_lng: number | null
          destination_name: string | null
          destination_lat: number | null
          destination_lng: number | null
          last_seen_at: string
          updated_at: string
        }
        Insert: {
          id: string
          status?: 'stopped' | 'driving'
          current_lat?: number | null
          current_lng?: number | null
          destination_name?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          last_seen_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          status?: 'stopped' | 'driving'
          current_lat?: number | null
          current_lng?: number | null
          destination_name?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          last_seen_at?: string
          updated_at?: string
        }
      }
      trips: {
        Row: {
          id: string
          driver_id: string
          destination_name: string | null
          destination_lat: number | null
          destination_lng: number | null
          status: 'active' | 'completed'
          started_at: string
          ended_at: string | null
        }
        Insert: {
          id?: string
          driver_id: string
          destination_name?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          status?: 'active' | 'completed'
          started_at?: string
          ended_at?: string | null
        }
        Update: {
          id?: string
          driver_id?: string
          destination_name?: string | null
          destination_lat?: number | null
          destination_lng?: number | null
          status?: 'active' | 'completed'
          started_at?: string
          ended_at?: string | null
        }
      }
      route_points: {
        Row: {
          id: number
          trip_id: string
          lat: number
          lng: number
          recorded_at: string
        }
        Insert: {
          id?: number
          trip_id: string
          lat: number
          lng: number
          recorded_at?: string
        }
        Update: {
          id?: number
          trip_id?: string
          lat?: number
          lng?: number
          recorded_at?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Driver = Database['public']['Tables']['drivers']['Row']
export type Trip = Database['public']['Tables']['trips']['Row']
export type RoutePoint = Database['public']['Tables']['route_points']['Row']
