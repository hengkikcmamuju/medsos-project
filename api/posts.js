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

  // Parse Body dengan Aman
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }
  body = body || {};

  try {
    // 1. GET: Ambil semua postingan
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json(data || []);
    }

    // 2. POST: Simpan postingan baru
    if (req.method === 'POST') {
      let validScheduledAt = null;
      if (body.scheduled_at && !isNaN(new Date(body.scheduled_at).getTime())) {
        validScheduledAt = new Date(body.scheduled_at).toISOString();
      }

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
        scheduled_at: validScheduledAt,
        revision_notes: body.revision_notes || '',
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

      return res.status(201).json(data && data[0] ? data[0] : newPost);
    }

    // 3. PUT: Update Status, Catatan Revisi, dan Materi Baru (Media & Caption)
    if (req.method === 'PUT') {
      const { id, status, revision_notes, media_url, caption, title } = body;
      if (!id) return res.status(400).json({ error: 'Post ID wajib disertakan.' });

      const updates = {};
      if (status !== undefined) updates.status = status;
      if (revision_notes !== undefined) updates.revision_notes = revision_notes;
      if (media_url !== undefined) updates.media_url = media_url;
      if (caption !== undefined) updates.caption = caption;
      if (title !== undefined) updates.title = title;
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

      return res.status(200).json(data && data[0] ? data[0] : updates);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
