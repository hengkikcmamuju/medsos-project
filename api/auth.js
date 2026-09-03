import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

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

    // Cari user di tabel 'users' Supabase
    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, role, avatar, status, password')
      .ilike('email', email.trim())
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Akun dengan email ini belum terdaftar di database.' });
    }

    // Verifikasi Password / PIN
    const userPassword = user.password || '123456';
    if (userPassword !== password.trim()) {
      return res.status(401).json({ error: 'Password / PIN yang dimasukkan salah.' });
    }

    // Buat format role standar (huruf kapital: ADMIN, REVIEWER, CREATOR, CLIENT)
    const normalizedRole = (user.role || 'creator').toUpperCase();

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: normalizedRole,
      avatar: user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
      status: user.status || 'active'
    };

    const token = 'PF-TOKEN-' + Buffer.from(`${user.id}:${Date.now()}`).toString('base64');

    return res.status(200).json({
      success: true,
      user: safeUser,
      token: token
    });
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
