
import { createClient } from '@supabase/supabase-js';

// Using provided credentials for anonymous and email auth
const supabaseUrl = 'https://rcbuikbjqgykssiatxpo.supabase.co';
const supabaseAnonKey = 'sb_publishable_uTIwEo4TJBo_YkX-OWN9qQ_5HJvl4c5';

// Initialize the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Logs a transcription/translation pair to Supabase.
 * Table expected: 'translations' 
 * Columns: session_id (uuid), user_text (text), agent_text (text), language (text)
 */
export async function logToSupabase(data: {
  session_id: string;
  user_text: string;
  agent_text: string;
  language: string;
}) {
  if (!supabase) {
    console.debug('Supabase client not initialized.');
    return;
  }

  try {
    const { error } = await supabase
      .from('translations')
      .insert([data]);

    if (error) {
      console.error('Supabase Sync Error:', error.message);
    } else {
      console.debug('Supabase Sync Successful');
    }
  } catch (err) {
    console.error('Supabase unexpected error:', err);
  }
}
