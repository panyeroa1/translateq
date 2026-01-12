
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { createClient } from '@supabase/supabase-js';

// Using provided credentials for anonymous and email auth
const supabaseUrl = 'https://rcbuikbjqgykssiatxpo.supabase.co';
const supabaseAnonKey = 'sb_publishable_uTIwEo4TJBo_YkX-OWN9qQ_5HJvl4c5';

// Initialize the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Logs a transcription/translation pair to Supabase.
 * Table expected: 'scribe_logs' 
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
    // Attempting insert into 'scribe_logs' table
    const { error } = await supabase
      .from('scribe_logs')
      .insert([data]);

    if (error) {
      // PGRST116 often refers to missing columns or tables
      if (error.code === 'PGRST116' || error.message.includes('scribe_logs')) {
         console.warn('Supabase Sync: Target table scribe_logs not found or permission denied. Transcription stored locally only.');
      } else {
         console.error('Supabase Sync Error:', error.message);
      }
    } else {
      console.debug('Supabase Sync Successful');
    }
  } catch (err) {
    console.debug('Supabase sync skipped: Network or schema restriction.', err);
  }
}
