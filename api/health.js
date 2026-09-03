export default function handler(req, res) {
  // Cek apakah kredensial Supabase sudah terpasang di Vercel
  const hasSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

  res.status(200).json({
    status: "ONLINE",
    version: "2.0.0-platinum",
    database: hasSupabase ? "SUPABASE_POSTGRESQL_LIVE" : "SANDBOX_IN_MEMORY",
    metaApiMode: "SIMULATION_ACTIVE",
    timestamp: new Date().toISOString()
  });
}
