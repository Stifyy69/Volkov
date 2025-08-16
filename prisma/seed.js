// seed.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function getOrCreateCategory(name) {
  const { data: existing, error: selErr } = await supabase
    .from('expense_categories')
    .select('id, name')
    .eq('name', name)
    .maybeSingle();

  if (selErr) throw selErr;
  if (existing) return existing;

  const { data: inserted, error: insErr } = await supabase
    .from('expense_categories')
    .insert([{ name }])
    .select('id, name')
    .single();

  if (insErr) throw insErr;
  return inserted;
}

async function main() {
  const categories = [
    { name: 'Bani curați' },
    { name: 'Bani murdari' },
    { name: 'Verificare taxă' },
    { name: 'Materiale' }, // placeholder
  ];

  for (const c of categories) {
    await getOrCreateCategory(c.name);
  }

  console.log('Seed /taxe complet ✅');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed a eșuat:', err);
    process.exit(1);
  });
