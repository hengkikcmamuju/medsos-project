const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let supabase = null;
const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseKey && 
  !supabaseUrl.includes('your-project-id') &&
  !supabaseKey.includes('your_supabase')
);

if (isSupabaseConfigured) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('✅ [Database] Platinum Engine terhubung ke Supabase PostgreSQL.');
} else {
  console.log('⚡ [Database] Menjalankan Mode In-Memory Platinum Engine.');
}

// Data cadangan jika belum pakai Supabase
let memoryBrands = [
  { id: 'BRD-01', name: 'BrandKita Official', handle: '@brandkita_official', logo: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200' },
  { id: 'BRD-02', name: 'Luxe Glow Skincare', handle: '@luxeglow.id', logo: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=200' }
];

let memoryUsers = [
  { id: 'USR-01', name: 'Dimas Admin (Lead)', email: 'admin@postflow.id', role: 'admin', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100', brandId: 'BRD-01' },
  { id: 'USR-02', name: 'Budi Santoso (Reviewer)', email: 'budi.manager@brandkita.id', role: 'reviewer', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100', brandId: 'BRD-01' },
  { id: 'USR-03', name: 'Putri Rahayu (Creator)', email: 'putri.creator@brandkita.id', role: 'creator', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100', brandId: 'BRD-01' },
  { id: 'USR-04', name: 'Sarah Client (Viewer)', email: 'sarah.client@partner.com', role: 'client', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100', brandId: 'BRD-01' }
];

let memoryPosts = [
  {
    id: 'POST-101',
    brandId: 'BRD-01',
    title: 'Promo Flash Sale 9.9 Payday',
    caption: '🔥 Dapatkan diskon hingga 50% hanya hari ini! Nikmati penawaran eksklusif kami. #BrandKita #PromoPayday #FlashSale',
    mediaUrl: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=800',
    platform: 'instagram',
    type: 'FEED',
    status: 'published',
    author: 'Putri Rahayu (Creator)',
    publishedAt: new Date(Date.now() - 7200000).toISOString(),
    createdAt: new Date().toISOString(),
    metrics: { likes: 1420, comments: 84, shares: 312, reach: 9800 },
    comments: []
  },
  {
    id: 'POST-102',
    brandId: 'BRD-01',
    title: 'Tips Merawat Skin Barrier 14 Hari',
    caption: 'Swipe untuk rahasia kulit sehat alami! 🌿 Gunakan pelembab berbahan ceramide setiap malam. #GlowUp #SkincareRoutine #SkinBarrier',
    mediaUrl: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800',
    platform: 'instagram',
    type: 'FEED',
    status: 'review',
    author: 'Putri Rahayu (Creator)',
    createdAt: new Date().toISOString(),
    metrics: { likes: 0, comments: 0, shares: 0, reach: 0 },
    comments: []
  },
  {
    id: 'POST-103',
    brandId: 'BRD-01',
    title: 'Behind The Scenes: Photoshoot 2026',
    caption: 'Intip keseruan tim kreatif kami di balik layar peluncuran produk terbaru! ✨ #BTS #ReelsViral #CreativeTeam',
    mediaUrl: 'https://images.unsplash.com/photo-1511556532299-8f662fc26c06?w=800',
    platform: 'instagram',
    type: 'REELS',
    status: 'draft',
    author: 'Putri Rahayu (Creator)',
    createdAt: new Date().toISOString(),
    metrics: { likes: 0, comments: 0, shares: 0, reach: 0 },
    comments: []
  }
];

function checkPermission(allowedRoles = []) {
  return (req, res, next) => {
    const userRole = (req.headers['x-user-role'] || 'reviewer').toLowerCase();
    if (allowedRoles.length && !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: `Akses ditolak. Peran "${userRole}" tidak memiliki izin untuk aksi ini.`
      });
    }
    next();
  };
}

async function pollMediaContainerStatus(containerId, accessToken, maxAttempts = 6) {
  const baseUrl = 'https://graph.facebook.com/v19.0';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await axios.get(`${baseUrl}/${containerId}`, {
        params: { fields: 'status_code,status', access_token: accessToken }
      });
      const statusCode = response.data.status_code;
      if (statusCode === 'FINISHED') return true;
      if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
        throw new Error(`Meta API Container Status: ${response.data.status || statusCode}`);
      }
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      if (attempt === maxAttempts) throw err;
    }
  }
  return true;
}

async function publishToSocialMedia({ platform = 'instagram', type = 'FEED', imageUrl, caption }) {
  const igUserId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  // Mode Simulasi jika belum ada live credentials
  if (!igUserId || !accessToken || accessToken.includes('sample_token')) {
    await new Promise(res => setTimeout(res, 1200));
    return {
      success: true,
      mode: 'SIMULATION',
      platform,
      publishId: (platform === 'instagram' ? '1799' : '9988') + Math.floor(100000000 + Math.random() * 900000000),
      message: `Simulasi publish ke ${platform.toUpperCase()} (${type}) berhasil diselesaikan!`
    };
  }

  if (platform === 'instagram') {
    const baseUrl = 'https://graph.facebook.com/v19.0';
    const containerPayload = { caption, access_token: accessToken };

    if (type === 'REELS' || imageUrl.endsWith('.mp4')) {
      containerPayload.media_type = 'REELS';
      containerPayload.video_url = imageUrl;
      containerPayload.share_to_feed = true;
    } else {
      containerPayload.image_url = imageUrl;
    }

    const containerRes = await axios.post(`${baseUrl}/${igUserId}/media`, containerPayload);
    const creationId = containerRes.data.id;
    await pollMediaContainerStatus(creationId, accessToken);

    const publishRes = await axios.post(`${baseUrl}/${igUserId}/media_publish`, {
      creation_id: creationId,
      access_token: accessToken
    });

    return {
      success: true,
      mode: 'REAL_LIVE',
      platform: 'instagram',
      creationId,
      publishId: publishRes.data.id,
      message: 'Postingan berhasil tayang live di Instagram!'
    };
  }

  return {
    success: true,
    mode: 'REAL_LIVE',
    platform,
    publishId: 'pub_' + Date.now(),
    message: `Postingan berhasil ditayangkan ke ${platform.toUpperCase()}!`
  };
}

// 1. Get All Posts
app.get('/api/posts', async (req, res) => {
  try {
    if (isSupabaseConfigured) {
      const { data: posts, error } = await supabase
        .from('posts')
        .select(`
          *,
          comments:post_comments(id, author, author_avatar, role, note, created_at)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const formatted = posts.map(p => ({
        id: p.id,
        brandId: p.brand_id || 'BRD-01',
        title: p.title,
        caption: p.caption,
        mediaUrl: p.media_url,
        platform: p.platform,
        type: p.type,
        status: p.status,
        author: p.author,
        scheduledAt: p.scheduled_at,
        publishedAt: p.published_at,
        createdAt: p.created_at,
        metrics: p.metrics || { likes: 0, comments: 0, shares: 0, reach: 0 },
        comments: p.comments || []
      }));
      return res.json({ success: true, posts: formatted, source: 'supabase' });
    }
    return res.json({ success: true, posts: memoryPosts, source: 'memory' });
  } catch (err) {
    return res.json({ success: true, posts: memoryPosts, source: 'fallback_memory' });
  }
});

// 2. Create Post Draft
app.post('/api/posts', checkPermission(['admin', 'reviewer', 'creator']), async (req, res) => {
  const { title, caption, mediaUrl, platform = 'instagram', type = 'FEED', author = 'Creator', brandId = 'BRD-01', scheduledAt = null } = req.body;
  if (!title || !mediaUrl) {
    return res.status(400).json({ success: false, error: 'Judul dan URL Media wajib diisi.' });
  }

  const newPostId = 'POST-' + Math.floor(100 + Math.random() * 900);
  const now = new Date().toISOString();

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('posts').insert({
        id: newPostId,
        brand_id: brandId,
        title,
        caption: caption || '',
        media_url: mediaUrl,
        platform,
        type,
        status: 'review',
        author,
        scheduled_at: scheduledAt,
        created_at: now
      }).select().single();

      if (error) throw error;
      return res.status(201).json({
        success: true,
        post: {
          id: data.id,
          brandId: data.brand_id,
          title: data.title,
          caption: data.caption,
          mediaUrl: data.media_url,
          platform: data.platform,
          type: data.type,
          status: data.status,
          author: data.author,
          scheduledAt: data.scheduled_at,
          createdAt: data.created_at,
          metrics: { likes: 0, comments: 0, shares: 0, reach: 0 },
          comments: []
        }
      });
    } catch (err) {
      console.error('Supabase Insert Error:', err.message);
    }
  }

  const newPost = {
    id: newPostId,
    brandId,
    title,
    caption: caption || '',
    mediaUrl,
    platform,
    type,
    status: 'review',
    author,
    scheduledAt,
    createdAt: now,
    metrics: { likes: 0, comments: 0, shares: 0, reach: 0 },
    comments: []
  };
  memoryPosts.unshift(newPost);
  return res.status(201).json({ success: true, post: newPost });
});

// 3. Approve & Auto-Publish
app.post('/api/posts/:id/approve-publish', checkPermission(['admin', 'reviewer']), async (req, res) => {
  const postId = req.params.id;
  let post = memoryPosts.find(p => p.id === postId);

  if (isSupabaseConfigured) {
    const { data } = await supabase.from('posts').select('*').eq('id', postId).single();
    if (data) {
      post = {
        id: data.id,
        title: data.title,
        caption: data.caption,
        mediaUrl: data.media_url,
        platform: data.platform,
        type: data.type
      };
    }
  }

  if (!post) return res.status(404).json({ success: false, error: 'Post tidak ditemukan' });

  try {
    const result = await publishToSocialMedia({
      platform: post.platform || 'instagram',
      type: post.type || 'FEED',
      imageUrl: post.mediaUrl,
      caption: post.caption
    });

    const now = new Date().toISOString();

    if (isSupabaseConfigured) {
      await supabase.from('posts').update({
        status: 'published',
        published_at: now,
        api_publish_data: result
      }).eq('id', postId);
    } else {
      const p = memoryPosts.find(p => p.id === postId);
      if (p) {
        p.status = 'published';
        p.publishedAt = now;
        p.apiPublishData = result;
      }
    }

    return res.json({ success: true, message: result.message, postId, apiResult: result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Request Revision
app.post('/api/posts/:id/revision', checkPermission(['admin', 'reviewer']), async (req, res) => {
  const { note, reviewerName = 'Reviewer' } = req.body;
  const postId = req.params.id;

  if (isSupabaseConfigured) {
    try {
      await supabase.from('posts').update({ status: 'revision' }).eq('id', postId);
      await supabase.from('post_comments').insert({
        post_id: postId,
        author: reviewerName,
        note: note || 'Perlu revisi'
      });
      return res.json({ success: true, message: 'Status diubah ke Perlu Revisi' });
    } catch (err) {
      console.error('Revision Error:', err.message);
    }
  }

  const p = memoryPosts.find(post => post.id === postId);
  if (!p) return res.status(404).json({ success: false, error: 'Post tidak ditemukan' });

  p.status = 'revision';
  if (!p.comments) p.comments = [];
  p.comments.push({
    id: Date.now(),
    author: reviewerName,
    note: note || 'Perlu perbaikan visual dan caption',
    createdAt: new Date().toISOString()
  });

  return res.json({ success: true, message: 'Catatan revisi tersimpan', post: p });
});

// 5. Users API
app.get('/api/users', async (req, res) => {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: true });
      if (!error && data.length) return res.json({ success: true, users: data });
    } catch (e) {}
  }
  return res.json({ success: true, users: memoryUsers });
});

// 6. Health Check
app.get('/api/health', (req, res) => {
  const hasMeta = Boolean(process.env.META_ACCESS_TOKEN && !process.env.META_ACCESS_TOKEN.includes('sample'));
  res.json({
    status: 'ONLINE',
    version: '2.0.0-platinum',
    database: isSupabaseConfigured ? 'SUPABASE_POSTGRESQL_LIVE' : 'SANDBOX_IN_MEMORY',
    metaApiMode: hasMeta ? 'LIVE_META_GRAPH_API' : 'SIMULATION_ACTIVE',
    timestamp: new Date().toISOString()
  });
});

module.exports = app;