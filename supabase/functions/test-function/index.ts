import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  return new Response('HELLO FROM TEST FUNCTION - NO AUTH REQUIRED', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' }
  })
})
