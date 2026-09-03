import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  (process.env.SUPABASE_URL || '').trim(),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  try {
    // 1. GET
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json(data || []);
    }

    // 2. POST
    if (req.method === 'POST') {
      const { data, error } = await supabase
        .from('team_members')
        .insert([{
          id: body.id || ('USR-' + Date.now()),
          name: body.name,
          email: body.email,
          role: body.role,
          avatar: body.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
          password: body.password || '123456',
          status: 'Aktif'
        }])
        .select();

      if (error) return res.status(400).json({ error: error.message });
      return res.status(201).json(data[0]);
    }

    // 3. PUT
    if (req.method === 'PUT') {
      const { id, name, email, role, avatar, password } = body;
      const updates = { name, email, role, avatar };
      if (password) updates.password = password;

      const { data, error } = await supabase
        .from('team_members')
        .update(updates)
        .eq('id', id)
        .select();

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json(data[0]);
    }

    // 4. DELETE (Mendukung body.id dan query.id)
    if (req.method === 'DELETE') {
      const id = body.id || req.query.id;
      if (!id) return res.status(400).json({ error: 'ID anggota wajib disertakan' });

      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('id', id);

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
