import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

// Meta Graph API Endpoint & Version
const GRAPH_API_VERSION = 'v19.0';
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export default async function handler(req, res) {
  // 1. CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-role');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method tidak diizinkan. Gunakan POST.' });
  }

  // 2. Parse Body Request
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }
  body = body || {};

  const { postId, role } = body;
  const userRole = String(role || req.headers['x-user-role'] || '').trim().toUpperCase();

  // Validasi Hak Akses (Hanya ADMIN dan REVIEWER yang boleh publish live ke Instagram)
  if (userRole !== 'ADMIN' && userRole !== 'REVIEWER') {
    return res.status(403).json({
      error: 'Akses Ditolak: Hanya Reviewer dan Administrator yang berhak menerbitkan konten ke Instagram.'
    });
  }

  if (!postId) {
    return res.status(400).json({ error: 'Post ID wajib disertakan.' });
  }

  // 3. Baca Konfigurasi Kredensial Meta & Instagram dari Environment Variables
  const igAccountId = (process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || '').trim();
  const metaAccessToken = (process.env.META_ACCESS_TOKEN || '').trim();

  try {
    // 4. Ambil Data Postingan dari Database Supabase
    const { data: post, error: fetchErr } = await supabase
      .from('posts')
      .select('*')
      .eq('id', postId)
      .single();

    if (fetchErr || !post) {
      return res.status(404).json({ error: 'Postingan tidak ditemukan di database Supabase.' });
    }

    if (post.status === 'published') {
      return res.status(400).json({
        error: 'Konten ini sudah pernah diterbitkan sebelumnya.',
        api_publish_data: post.api_publish_data
      });
    }

    // 5. Persiapan URL Gambar Publik (Syarat Mutlak Meta Graph API)
    let publicImageUrl = post.media_url;

    // Jika gambar diunggah secara lokal (berupa data Base64 data:image/...),
    // otomatis kita simpan ke Supabase Storage agar mendapatkan URL HTTPS publik!
    if (publicImageUrl.startsWith('data:image/')) {
      try {
        const matches = publicImageUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (matches) {
          const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
          const base64Content = matches[2];
          const buffer = Buffer.from(base64Content, 'base64');
          const fileName = `ig-publish-${postId}-${Date.now()}.${ext}`;

          // Unggah ke bucket 'post-media' di Supabase
          const { error: uploadErr } = await supabase.storage
            .from('post-media')
            .upload(fileName, buffer, {
              contentType: `image/${matches[1]}`,
              upsert: true
            });

          if (!uploadErr) {
            const { data: urlData } = supabase.storage
              .from('post-media')
              .getPublicUrl(fileName);
            if (urlData && urlData.publicUrl) {
              publicImageUrl = urlData.publicUrl;
            }
          }
        }
      } catch (storageErr) {
        console.warn('Gagal upload otomatis ke Supabase Storage:', storageErr.message);
      }
    }

    // 6. Cek Apakah Kredensial Nyata Meta API Sudah Dikonfigurasi
    const isMetaConfigured = Boolean(
      igAccountId &&
      metaAccessToken &&
      !metaAccessToken.includes('sample_token') &&
      !metaAccessToken.includes('EAAXxFake')
    );

    // MODE SIMULASI AMAN: Jika token Meta belum diisi di Vercel
    if (!isMetaConfigured) {
      const simulatedPublishId = '1789' + Math.floor(100000000 + Math.random() * 900000000);
      const simulatedData = {
        mode: 'SIMULATION_READY',
        publish_id: simulatedPublishId,
        platform: 'instagram',
        permalink: `https://www.instagram.com/p/C${Math.random().toString(36).substring(2, 9)}/`,
        message: 'Kredensial Meta API belum diisi di Vercel. Postingan ditandai published dalam mode simulasi aman.'
      };

      await supabase
        .from('posts')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          api_publish_data: simulatedData
        })
        .eq('id', postId);

      return res.status(200).json({
        success: true,
        mode: 'SIMULATION',
        message: 'Postingan disetujui (Simulasi Meta API). Isi META_ACCESS_TOKEN di Vercel untuk tayang live.',
        post: { ...post, status: 'published' },
        publishData: simulatedData
      });
    }

    // 7. REAL LIVE PUBLISHING: PROSES 2-LANGKAH RESMI META GRAPH API
    // LANGKAH 1: Buat Media Container di Server Instagram
    const containerParams = new URLSearchParams({
      image_url: publicImageUrl,
      caption: post.caption || post.title || '',
      access_token: metaAccessToken
    });

    const createContainerRes = await fetch(`${GRAPH_BASE_URL}/${igAccountId}/media`, {
      method: 'POST',
      body: containerParams
    });

    const containerData = await createContainerRes.json();

    if (containerData.error) {
      console.error('Meta API Step 1 Error:', containerData.error);
      return res.status(400).json({
        error: `Meta API Container Error: ${containerData.error.message || 'Gagal membuat container media di Instagram.'}`
      });
    }

    const creationId = containerData.id;

    // Tunggu 3 detik agar server Meta selesai memproses dan mengunduh gambar
    await new Promise(resolve => setTimeout(resolve, 3000));

    // LANGKAH 2: Publikasikan Media Container ke Feed Instagram
    const publishParams = new URLSearchParams({
      creation_id: creationId,
      access_token: metaAccessToken
    });

    const publishRes = await fetch(`${GRAPH_BASE_URL}/${igAccountId}/media_publish`, {
      method: 'POST',
      body: publishParams
    });

    const publishResult = await publishRes.json();

    if (publishResult.error) {
      console.error('Meta API Step 2 Error:', publishResult.error);
      return res.status(400).json({
        error: `Meta API Publishing Error: ${publishResult.error.message || 'Gagal menerbitkan container ke Feed Instagram.'}`
      });
    }

    const liveMediaId = publishResult.id;

    // LANGKAH 3: Ambil Tautan Langsung (Permalink) Postingan yang Baru Terbit
    let postPermalink = `https://www.instagram.com/`;
    try {
      const mediaInfoRes = await fetch(
        `${GRAPH_BASE_URL}/${liveMediaId}?fields=permalink,timestamp,shortcode&access_token=${metaAccessToken}`
      );
      const mediaInfo = await mediaInfoRes.json();
      if (mediaInfo && mediaInfo.permalink) {
        postPermalink = mediaInfo.permalink;
      }
    } catch (e) {
      console.warn('Gagal mengambil permalink:', e.message);
    }

    const finalPublishData = {
      mode: 'REAL_LIVE',
      publish_id: liveMediaId,
      creation_id: creationId,
      platform: 'instagram',
      permalink: postPermalink,
      published_at: new Date().toISOString()
    };

    // 8. Perbarui Status di Database Supabase
    await supabase
      .from('posts')
      .update({
        status: 'published',
        published_at: finalPublishData.published_at,
        api_publish_data: finalPublishData
      })
      .eq('id', postId);

    return res.status(200).json({
      success: true,
      mode: 'REAL_LIVE',
      message: '🎉 Postingan BERHASIL TAYANG LIVE di Instagram!',
      publishData: finalPublishData
    });

  } catch (err) {
    console.error('Publishing handler exception:', err);
    return res.status(500).json({
      error: err.message || 'Terjadi kesalahan internal saat menghubungi server Instagram.'
    });
  }
}
