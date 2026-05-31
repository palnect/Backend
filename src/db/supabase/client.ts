import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../config';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger('supabase');

let _client: SupabaseClient | null = null;
let _adminClient: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient => {
  if (!_client) {
    if (!config.supabase.url || !config.supabase.anonKey) {
      throw new Error('Supabase URL and anon key are required');
    }
    _client = createClient(config.supabase.url, config.supabase.anonKey);
    log.info('Supabase client initialized');
  }
  return _client;
};

export const getSupabaseAdmin = (): SupabaseClient => {
  if (!_adminClient) {
    if (!config.supabase.url || !config.supabase.serviceRoleKey) {
      throw new Error('Supabase URL and service role key are required');
    }
    _adminClient = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    log.info('Supabase admin client initialized');
  }
  return _adminClient;
};