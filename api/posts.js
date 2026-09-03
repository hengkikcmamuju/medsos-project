import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // GET: Ambil semua data postingan
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json(data);
    }

    // POST: Simpan postingan baru
    if (req.method === 'POST') {
      const newPost = req.body;
      const { data, error } = await supabase
        .from('posts')
        .insert([newPost])
        .select();

      if (error) throw error;
      return res.status(201).json(data[0]);
    }

    // PUT: Update status / revisi / approve postingan
    if (req.method === 'PUT') {
      const { id, ...updates } = req.body;
      const { data, error } = await supabase
        .from('posts')
        .update(updates)
        .eq('id', id)
        .select();

      if (error) throw error;
      return res.status(200).json(data[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
