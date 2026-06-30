const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

let supabase = null;

if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  // Self-initiate the bucket creation if it doesn't exist
  (async () => {
    try {
      const { error: err1 } = await supabase.storage.getBucket('payslips');
      if (err1 && err1.message.includes('not found')) {
        console.log('[Supabase] Bucket "payslips" not found, creating it...');
        await supabase.storage.createBucket('payslips', { public: true });
      }
      
      const { error: err2 } = await supabase.storage.getBucket('employee-documents');
      if (err2 && err2.message.includes('not found')) {
        console.log('[Supabase] Bucket "employee-documents" not found, creating it...');
        await supabase.storage.createBucket('employee-documents', { public: true });
      }
    } catch (err) {
      console.warn('[Supabase Storage Init Warning]:', err.message);
    }
  })();
} else {
  console.warn('[Supabase] WARNING: SUPABASE_URL or SUPABASE_SERVICE_KEY is missing. File storage uploads will fail.');
}

module.exports = supabase;
