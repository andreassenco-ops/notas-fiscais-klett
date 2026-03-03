import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Use service role key to bypass RLS
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { action, table, data, id, filters } = await req.json();

    let result;

    switch (action) {
      case 'update':
        if (!table || !data) {
          throw new Error('Table and data are required for update');
        }
        
        let updateQuery = supabase.from(table).update(data);
        
        if (id) {
          updateQuery = updateQuery.eq('id', id);
        } else if (filters) {
          for (const [key, value] of Object.entries(filters)) {
            updateQuery = updateQuery.eq(key, value);
          }
        }
        
        const { data: updateData, error: updateError } = await updateQuery.select();
        if (updateError) throw updateError;
        result = updateData;
        break;

      case 'insert':
        if (!table || !data) {
          throw new Error('Table and data are required for insert');
        }
        
        const { data: insertData, error: insertError } = await supabase
          .from(table)
          .insert(data)
          .select();
        
        if (insertError) throw insertError;
        result = insertData;
        break;

      case 'delete':
        if (!table || !id) {
          throw new Error('Table and id are required for delete');
        }
        
        const { error: deleteError } = await supabase
          .from(table)
          .delete()
          .eq('id', id);
        
        if (deleteError) throw deleteError;
        result = { success: true };
        break;

      case 'upsert':
        if (!table || !data) {
          throw new Error('Table and data are required for upsert');
        }
        
        const { data: upsertData, error: upsertError } = await supabase
          .from(table)
          .upsert(data)
          .select();
        
        if (upsertError) throw upsertError;
        result = upsertData;
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Admin API error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});
