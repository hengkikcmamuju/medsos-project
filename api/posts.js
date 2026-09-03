import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: 'Environment variables SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum terpasang di Vercel.'
    });
  }

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('posts')
        .select('*');

      if (error) {
        return res.status(400).json({ error: error.message, details: error });
      }
      return res.status(200).json(data || []);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({
      error: err.message || 'Fetch failed',
      cause: err.cause ? String(err.cause) : null,
      stack: err.stack
    });
  }
}
