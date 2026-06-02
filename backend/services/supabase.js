import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export async function uploadAudio(filePath, fileName) {
  const fs = await import('fs');
  const fileBuffer = fs.default.readFileSync(filePath);
  const storagePath = `calls/${Date.now()}-${fileName}`;

  const { error } = await supabase.storage
    .from('call-recordings')
    .upload(storagePath, fileBuffer, { contentType: 'audio/mp4', upsert: false });

  if (error) throw new Error(`Supabase storage upload error: ${error.message}`);

  const { data: signed } = await supabase.storage
    .from('call-recordings')
    .createSignedUrl(storagePath, 3600); // 1h gültig

  return { signedUrl: signed.signedUrl, storagePath };
}

export async function deleteAudio(storagePath) {
  await supabase.storage.from('call-recordings').remove([storagePath]);
}

export async function saveCall(data) {
  // Try with all fields first
  let { data: row, error } = await supabase
    .from('calls').insert(data).select().single();

  // If schema cache hasn't refreshed for new columns, retry without them
  if (error?.message?.includes('column') || error?.message?.includes('schema')) {
    console.warn('[supabase] schema miss, retrying without new columns:', error.message);
    const { segments, notes, ...coreData } = data;
    const retry = await supabase.from('calls').insert(coreData).select().single();
    if (retry.error) throw new Error(`Supabase insert error: ${retry.error.message}`);
    return retry.data;
  }

  if (error) throw new Error(`Supabase insert error: ${error.message}`);
  return row;
}

export async function getCalls() {
  const { data, error } = await supabase
    .from('calls')
    .select('id, prospect, company, role, date, duration, outcome, score, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Supabase query error: ${error.message}`);
  return data;
}

export async function getCall(id) {
  const { data, error } = await supabase
    .from('calls')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw new Error(`Supabase query error: ${error.message}`);
  return data;
}
