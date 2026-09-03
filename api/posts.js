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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-role, Authorization');

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

  // Normalisasi Role secara case-insensitive dari berbagai sumber input
  const rawRole = req.headers['x-user-role'] || body.role || (req.query && req.query.role) || '';
  const userRole = String(rawRole).trim().toUpperCase();

  try {
    // 1. GET: Ambil daftar postingan
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json(data || []);
    }

    // 2. POST: Simpan postingan baru (Wewenang: CREATOR & ADMIN)
    if (req.method === 'POST') {
      const creatorRole = (userRole || 'CREATOR');
      if (creatorRole !== 'CREATOR' && creatorRole !== 'ADMIN') {
        return res.status(403).json({ error: 'Akses Ditolak: Hanya Creator dan Admin yang dapat membuat postingan baru.' });
      }

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
        status: 'draft',
        author: body.author || 'Tim Kreatif',
        scheduled_at: validScheduledAt,
        revision_notes: '',
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

    // 3. PUT: Update Status / Revisi / Publish (Validasi RBAC Ketat)
    if (req.method === 'PUT') {
      const { id, status, revision_notes, media_url, caption, title } = body;
      if (!id) return res.status(400).json({ error: 'Post ID wajib disertakan.' });

      // Cek Wewenang Status secara case-insensitive
      if (userRole === 'CREATOR' && status === 'published') {
        return res.status(403).json({ error: 'Akses Ditolak: Creator tidak memiliki wewenang untuk menerbitkan postingan.' });
      }
      if ((userRole === 'REVIEWER' || userRole === 'CLIENT') && status === 'draft') {
        return res.status(403).json({ error: 'Akses Ditolak: Reviewer/Client tidak dapat memindahkan postingan kembali ke draft.' });
      }

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

    // 4. DELETE: Hapus postingan (Khusus ADMIN & Hanya untuk postingan belum published)
    if (req.method === 'DELETE') {
      const id = body.id || (req.query && req.query.id);

      if (!id) return res.status(400).json({ error: 'Post ID wajib disertakan.' });
      if (userRole !== 'ADMIN') {
        return res.status(403).json({ error: 'Akses Ditolak: Hanya Administrator yang berwenang menghapus postingan.' });
      }

      // Pastikan status bukan 'published'
      const { data: existingPost, error: checkErr } = await supabase
        .from('posts')
        .select('status')
        .eq('id', id)
        .single();

      if (checkErr || !existingPost) {
        return res.status(404).json({ error: 'Postingan tidak ditemukan di database.' });
      }

      if (existingPost.status === 'published') {
        return res.status(403).json({ error: 'Postingan yang sudah terbit (published) tidak dapat dihapus.' });
      }

      const { error: deleteErr } = await supabase
        .from('posts')
        .delete()
        .eq('id', id);

      if (deleteErr) {
        console.error('Supabase delete error:', deleteErr);
        return res.status(400).json({ error: deleteErr.message });
      }

      return res.status(200).json({ success: true, message: 'Postingan berhasil dihapus secara permanen.' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
