import { createClient } from '@supabase/supabase-js';
import multer from 'multer';

// Inisialisasi Supabase
const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

// PENTING: Matikan body parser bawaan Next.js agar Multer dan parser manual kita bisa bekerja
export const config = {
  api: {
    bodyParser: false
  }
};

// Konfigurasi Multer untuk menangkap file 'media_files' ke dalam memori RAM sementara
const upload = multer({ storage: multer.memoryStorage() });

// Helper untuk menjalankan middleware Express di lingkungan Vercel/Next.js
function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) return reject(result);
      resolve(result);
    });
  });
}

// Helper untuk membaca JSON murni jika frontend tidak menggunakan FormData
const parseJSONBody = (req) => {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data ? JSON.parse(data) : {}));
  });
};

export default async function handler(req, res) {
  // Atur Header CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ==== METHOD GET: MENGAMBIL DATA UNTUK KANBAN ====
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('posts').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data);
    }

    const isJson = req.headers['content-type']?.includes('application/json');

    // ==== METHOD POST: MENAMBAH DRAF BARU (DENGAN FILE FISIK FORMDATA) ====
    if (req.method === 'POST') {
      if (isJson) req.body = await parseJSONBody(req);
      else await runMiddleware(req, res, upload.array('media_files', 10)); // Terima hingga 10 file sekaligus

      const { id, title, type, caption, status, author, author_id, role, platform } = req.body;
      const files = req.files || [];

      if (files.length === 0 && !isJson) return res.status(400).json({ error: 'File wajib diunggah' });

      let uploadedUrls = [];
      
      // Jika ada file fisik, upload satu per satu ke Supabase Storage
      if (files.length > 0) {
        for (const file of files) {
          const ext = file.originalname.split('.').pop();
          const fileName = `media-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
          
          const { error: uploadError } = await supabase.storage
            .from('post-media')
            .upload(fileName, file.buffer, { contentType: file.mimetype, upsert: true });
          
          if (uploadError) throw uploadError;
          
          const { data } = supabase.storage.from('post-media').getPublicUrl(fileName);
          uploadedUrls.push({ 
            url: data.publicUrl, 
            type: file.mimetype.startsWith('video/') ? 'video' : 'image', 
            name: file.originalname 
          });
        }
      }

      // Ambil file index ke-0 sebagai gambar cover/fallback utama
      const primaryUrl = uploadedUrls.length > 0 ? uploadedUrls[0].url : '';

      // Simpan seluruh data teks dan daftar array file (JSONB) ke tabel posts
      const { error: dbError } = await supabase.from('posts').insert([{
        id, brand_id: 'BRD-01', title, type, caption, status, author, author_id, role, platform,
        media_url: primaryUrl, media_urls: uploadedUrls
      }]);

      if (dbError) throw dbError;
      return res.status(200).json({ success: true, message: 'Draf berhasil disimpan dengan file aslinya.' });
    } 
    
    // ==== METHOD PUT: UPDATE STATUS ATAU REVISI FILE ====
    if (req.method === 'PUT') {
      if (isJson) req.body = await parseJSONBody(req);
      else await runMiddleware(req, res, upload.array('media_files', 10));

      const body = req.body;
      const files = req.files || [];

      let updateData = {};
      if (body.status) updateData.status = body.status;
      if (body.title) updateData.title = body.title;
      if (body.caption) updateData.caption = body.caption;
      if (body.revision_notes !== undefined) updateData.revision_notes = body.revision_notes;

      // Jika saat revisi pengguna mengunggah file gambar/video baru
      if (files.length > 0) {
         const uploadedUrls = [];
         for (const file of files) {
           const ext = file.originalname.split('.').pop();
           const fileName = `media-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
           await supabase.storage.from('post-media').upload(fileName, file.buffer, { contentType: file.mimetype, upsert: true });
           const { data } = supabase.storage.from('post-media').getPublicUrl(fileName);
           uploadedUrls.push({ url: data.publicUrl, type: file.mimetype.startsWith('video/') ? 'video' : 'image', name: file.originalname });
         }
         updateData.media_url = uploadedUrls[0].url;
         updateData.media_urls = uploadedUrls; // Timpa JSONB media lama
      }

      const { error: dbError } = await supabase.from('posts').update(updateData).eq('id', body.id);
      if (dbError) throw dbError;
      return res.status(200).json({ success: true });
    }

    // ==== METHOD DELETE: HAPUS POSTINGAN ====
    if (req.method === 'DELETE') {
      const parsedBody = isJson ? await parseJSONBody(req) : {};
      const id = req.query.id || parsedBody.id;
      
      if (!id) return res.status(400).json({ error: 'ID tidak ditemukan' });
      
      const { error } = await supabase.from('posts').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

  } catch (error) {
    console.error('Server API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
Terapkan kedua file ini, dan Vercel *Timeout Crash* tidak akan mengganggu unggahan video Anda lagi! Jangan ragu untuk mencobanya secara langsung.
