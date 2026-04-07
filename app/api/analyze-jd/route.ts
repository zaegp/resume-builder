import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { analyzeJD } from '@/lib/ai/analyze-jd'

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

    const { jd_text } = await request.json()

    if (!jd_text || typeof jd_text !== 'string' || jd_text.trim().length < 50) {
      return NextResponse.json({ error: 'Please paste a full job description (50+ characters).' }, { status: 400 })
    }

    const requirements = await analyzeJD(jd_text)

    return NextResponse.json({ requirements })
  } catch (err) {
    console.error('Analyze JD error:', err)
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
