import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { matchAndRewrite } from '@/lib/ai/match-rewrite'
import type { JDRequirement, ExtractedProfile, OutputLanguage } from '@/lib/types'

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

    const { requirements, profile_id, language } = await request.json() as {
      requirements: JDRequirement[]
      profile_id: string
      language: OutputLanguage
    }

    if (!requirements || !Array.isArray(requirements) || requirements.length === 0) {
      return NextResponse.json({ error: 'No JD requirements provided' }, { status: 400 })
    }

    if (!language || !['en', 'zh'].includes(language)) {
      return NextResponse.json({ error: 'Language must be "en" or "zh"' }, { status: 400 })
    }

    // Fetch profile
    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('extracted_data')
      .eq('id', profile_id)
      .eq('user_id', user.id)
      .single()

    if (profileError || !profileRow) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const profile = profileRow.extracted_data as ExtractedProfile

    if (!profile.work || profile.work.length === 0) {
      return NextResponse.json({ error: 'Profile has no work experience. Add at least one entry first.' }, { status: 400 })
    }

    const result = await matchAndRewrite(requirements, profile, language)

    return NextResponse.json(result)
  } catch (err) {
    console.error('Match rewrite error:', err)
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
