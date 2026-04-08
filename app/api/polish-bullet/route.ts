import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { sanitizeUserContent, validateInput } from '@/lib/sanitize'
import OpenAI from 'openai'

const openai = new OpenAI()

export const maxDuration = 30
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { success: withinLimit } = await checkRateLimit(user.id)
    if (!withinLimit) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
    }

    const { rough_text, requirement, language } = await request.json()

    if (!rough_text || typeof rough_text !== 'string' || rough_text.trim().length < 5) {
      return NextResponse.json({ error: 'Please describe your experience.' }, { status: 400 })
    }

    const langInstruction = language === 'zh'
      ? 'Output in Traditional Chinese (繁體中文). Keep company names and technical terms in English.'
      : 'Output in English.'

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a resume bullet point editor. The user will give you a rough description of their work experience. Polish it into a clear, professional resume bullet point.

RULES:
- Keep the meaning and facts exactly as the user stated. Do NOT add metrics, technologies, or achievements they didn't mention.
- If they mention a number or result, keep it. If they don't, don't invent one.
- Make it concise (1-2 sentences max).
- Use active verbs (Led, Built, Designed, Implemented, etc.).
- The requirement context helps you use relevant keywords, but don't fabricate experience.
${langInstruction}`
        },
        {
          role: 'user',
          content: `JD Requirement: ${sanitizeUserContent(validateInput(requirement, 500), 'requirement')}

My rough description: ${sanitizeUserContent(validateInput(rough_text, 1000), 'experience')}

Polish this into a resume bullet point.`
        }
      ],
      max_tokens: 300,
    })

    const polished = response.choices[0]?.message?.content?.trim()
    if (!polished) {
      return NextResponse.json({ error: 'AI did not return a polished bullet.' }, { status: 500 })
    }

    return NextResponse.json({ polished })
  } catch (err) {
    console.error('Polish bullet error:', err)
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
