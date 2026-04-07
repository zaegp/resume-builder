import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { generateCoverLetter } from '@/lib/ai/cover-letter'
import type { MatchCard, OutputLanguage } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { success: withinLimit } = await checkRateLimit(user.id)
    if (!withinLimit) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 })
    }

    const { confirmed_cards, jd_text, language } = await request.json() as {
      confirmed_cards: MatchCard[]
      jd_text: string
      language: OutputLanguage
    }

    if (!confirmed_cards || !Array.isArray(confirmed_cards)) {
      return NextResponse.json({ error: 'No confirmed experiences provided' }, { status: 400 })
    }

    if (!jd_text || typeof jd_text !== 'string') {
      return NextResponse.json({ error: 'Job description required' }, { status: 400 })
    }

    if (!language || !['en', 'zh'].includes(language)) {
      return NextResponse.json({ error: 'Language must be "en" or "zh"' }, { status: 400 })
    }

    const coverLetter = await generateCoverLetter(confirmed_cards, jd_text, language)

    return NextResponse.json({ cover_letter: coverLetter })
  } catch (err) {
    console.error('Cover letter error:', err)
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
