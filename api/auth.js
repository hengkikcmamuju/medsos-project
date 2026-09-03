import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  (process.env.SUPABASE_URL || '').trim(),
  (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    const { email, password } = body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email dan Password wajib diisi.' });
    }

    // Cari user di tabel team_members
    const { data: user, error } = await supabase
      .from('team_members')
      .select('id, name, email, role, avatar, status, password')
      .ilike('email', email.trim())
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Akun dengan email tersebut tidak ditemukan.' });
    }

    if (user.password !== password.trim()) {
      return res.status(401).json({ error: 'Password / PIN yang dimasukkan salah.' });
    }

    // Jangan kirim field password ke frontend
    const { password: _, ...safeUserData } = user;

    // Buat token sesi sederhana
    const sessionToken = 'PF-TOKEN-' + Buffer.from(`${user.id}:${Date.now()}`).toString('base64');

    return res.status(200).json({
      success: true,
      user: safeUserData,
      token: sessionToken
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
