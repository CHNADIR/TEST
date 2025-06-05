import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''

function validatePassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 12) {
    return { valid: false, message: 'Le mot de passe doit contenir au moins 12 caractères' }
  }
  
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Le mot de passe doit contenir au moins une lettre majuscule' }
  }
  
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Le mot de passe doit contenir au moins une lettre minuscule' }
  }
  
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Le mot de passe doit contenir au moins un chiffre' }
  }
  
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { valid: false, message: 'Le mot de passe doit contenir au moins un caractère spécial' }
  }
  
  return { valid: true }
}

serve(async (req) => {
  try {
    const { event, password } = await req.json()
    
    // Validation uniquement lors de la création ou mise à jour du mot de passe
    if (
      event === 'SIGNUP' || 
      event === 'PASSWORD_RECOVERY' || 
      event === 'PASSWORD_UPDATE'
    ) {
      const validation = validatePassword(password)
      
      if (!validation.valid) {
        return new Response(
          JSON.stringify({ error: validation.message }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }
    
    // Si tout est valide, autoriser l'opération
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Erreur de validation du mot de passe' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})