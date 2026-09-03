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
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: 'Variabel SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum disetel di Vercel.'
    });
  }

  try {
    // 1. AMBIL SEMUA POST (GET)
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json(data || []);
    }

    // Parse req.body jika berupa string
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        // Biarkan tetap body jika gagal parse
      }
    }

    // 2. SIMPAN POST BARU (POST)
    if (req.method === 'POST') {
      const newPost = {
        id: body.id || ('POST-' + Date.now()),
        brand_id: body.brand_id || 'BRD-01',
        title: body.title || 'Tanpa Judul',
        caption: body.caption || '',
        media_url: body.media_url || '',
        platform: body.platform || 'instagram',
        type: body.type || 'FEED',
        status: body.status || 'draft',
        author: body.author || 'Tim Kreatif',
        scheduled_at: body.scheduled_at ? new Date(body.scheduled_at).toISOString() : null,
        metrics: { likes: 0, reach: 0, shares: 0, comments: 0 },
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('posts')
        .insert([newPost])
        .select();

      if (error) {
        console.error('Supabase insert error:', error);
        return res.status(400).json({ error: error.message });
      }

      return res.status(201).json(data[0]);
    }

    // 3. UPDATE STATUS / APPROVAL (PUT)
    if (req.method === 'PUT') {
      const { id, status } = body;
      if (!id) return res.status(400).json({ error: 'Post ID diperlukan' });

      const updates = { status };
      if (status === 'published') {
        updates.published_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('posts')
        .update(updates)
        .eq('id', id)
        .select();

      if (error) {
        console.error('Supabase update error:', error);
        return res.status(400).json({ error: error.message });
      }

      return res.status(200).json(data[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
