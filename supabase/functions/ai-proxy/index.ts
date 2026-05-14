import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const COSTS: Record<string, number> = {
  tts: 1,
  whisper: 3,
  'gpt-ipa': 1,
  'gpt-dialogue': 2,
  'gpt-generate': 15,
  azure: 2,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Unauthorized' }, 401)

  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: { user }, error: authErr } = await supa.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const body = await req.json()
  const { action } = body
  const cost = COSTS[action]
  if (cost === undefined) return json({ error: 'Unknown action' }, 400)

  // Get or create credits
  let { data: row } = await supa
    .from('user_credits').select('balance, is_admin').eq('user_id', user.id).maybeSingle()

  if (!row) {
    await supa.from('user_credits').insert({ user_id: user.id, balance: 500 })
    row = { balance: 500, is_admin: false }
  }

  const isAdmin = row.is_admin === true
  if (!isAdmin && row.balance < cost) return json({ error: 'credits_exhausted', balance: row.balance }, 402)

  const newBalance = isAdmin ? row.balance : row.balance - cost
  if (!isAdmin) await supa.from('user_credits').update({ balance: newBalance }).eq('user_id', user.id)

  const OAI_KEY   = Deno.env.get('OPENAI_API_KEY')!
  const AZ_KEY    = Deno.env.get('AZURE_SPEECH_KEY')!
  const AZ_REGION = Deno.env.get('AZURE_SPEECH_REGION')!

  try {
    if (action === 'tts') {
      const { text, voice, speed } = body
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + OAI_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'tts-1', input: text, voice: voice || 'nova', speed: speed || 1 })
      })
      if (!res.ok) throw new Error('TTS ' + res.status)
      const buf = await res.arrayBuffer()
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
      return json({ audio: b64, balance: isAdmin ? -1 : newBalance })
    }

    if (action === 'whisper') {
      const { audioBase64, mimeType, language } = body
      const bytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))
      const form  = new FormData()
      form.append('file', new Blob([bytes], { type: mimeType || 'audio/webm' }), 'rec.webm')
      form.append('model', 'whisper-1')
      if (language) form.append('language', language)
      const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + OAI_KEY },
        body: form
      })
      if (!res.ok) throw new Error('Whisper ' + res.status)
      const data = await res.json()
      return json({ text: data.text || '', balance: isAdmin ? -1 : newBalance })
    }

    if (action === 'gpt-ipa' || action === 'gpt-dialogue' || action === 'gpt-generate') {
      const { messages, response_format } = body
      const reqBody: Record<string, unknown> = { model: 'gpt-4o-mini', messages }
      if (response_format) reqBody.response_format = response_format
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + OAI_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
      })
      if (!res.ok) throw new Error('GPT ' + res.status)
      const data = await res.json()
      return json({ ...data, balance: isAdmin ? -1 : newBalance })
    }

    if (action === 'azure') {
      const { audioBase64, mimeType, language, referenceText } = body
      const bytes  = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))
      const lang   = language?.includes('-') ? language : (language || 'en') + '-US'

      // Use TextEncoder so non-ASCII referenceText encodes correctly before btoa
      const configJson = JSON.stringify({
        ReferenceText: referenceText,
        GradingSystem: 'HundredMark',
        Granularity: 'Phoneme',
        Dimension: 'Comprehensive',
        EnableMiscue: true,
      })
      const configBytes = new TextEncoder().encode(configJson)
      let configBin = ''
      for (let i = 0; i < configBytes.length; i++) configBin += String.fromCharCode(configBytes[i])
      const config = btoa(configBin)

      const url = `https://${AZ_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${lang}&format=detailed&profanity=raw`
      const contentType = mimeType?.startsWith('audio/wav') ? 'audio/wav; codecs=audio/pcm; samplerate=16000' : (mimeType || 'audio/webm;codecs=opus')
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': AZ_KEY,
          'Content-Type': contentType,
          'Pronunciation-Assessment': config,
        },
        body: bytes
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error('Azure ' + res.status + ' ' + errText)
      }
      const data = await res.json()
      return json({ ...data, balance: isAdmin ? -1 : newBalance })
    }

    return json({ error: 'Unknown action' }, 400)

  } catch (e: unknown) {
    if (!isAdmin) await supa.from('user_credits').update({ balance: row.balance }).eq('user_id', user.id)
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, 500)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  })
}
