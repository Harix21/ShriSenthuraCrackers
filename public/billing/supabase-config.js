/**
 * Supabase Configuration
 * 
 * IMPORTANT: Replace these values with your actual Supabase project credentials
 * Get these from your Supabase project dashboard:
 * 1. Go to https://app.supabase.com
 * 2. Select your project
 * 3. Click "Settings" → "API"
 * 4. Copy the Project URL and anon/public key
 * 
 * NEVER expose your service_role_key in frontend code
 */

const SUPABASE_CONFIG = {
  // Replace with your actual Supabase project URL
  // Example: https://your-project-id.supabase.co
  url: 'https://meoajkfflzlwegbzkses.supabase.co',

  // Replace with your actual Supabase anon/public key
  // This is safe to use in frontend code (it's public)
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lb2Fqa2ZmbHpsd2VnYnprc2VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MzUwNjMsImV4cCI6MjEwNzMxMTA2M30.F_me8NYfzIS7I8W8E_YuqBDh9sQQsILC-hz_hho1rw8',

  // Admin WhatsApp number
  adminWhatsapp: '+919940051105'
};

window.SUPABASE_CONFIG = SUPABASE_CONFIG;
globalThis.SUPABASE_CONFIG = SUPABASE_CONFIG;

// Validate configuration
if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
  console.error('❌ Supabase configuration is incomplete. Please update supabase-config.js with your credentials.');
}
