import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { extractFromDocx } from '@/lib/ai/extract-docx'

export const maxDuration = 60
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
      return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 })
    }

    const { count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if ((count ?? 0) >= 2) {
      return NextResponse.json({
        error: 'Free tier limit: 2 resume profiles. Delete an existing profile or join the waitlist for unlimited access.',
        limit_reached: true
      }, { status: 403 })
    }

    // Now receives pre-extracted text from client (mammoth runs client-side)
    const { raw_text, file_name } = await request.json()

    if (!raw_text || typeof raw_text !== 'string' || raw_text.trim().length < 50) {
      return NextResponse.json({
        error: "Couldn't extract text from this file. Please enter your information manually.",
        fallback_manual: true
      }, { status: 422 })
    }

    // AI extraction
    const profile = await extractFromDocx(raw_text)

    // Save to database
    const { data: profileRow, error: dbError } = await supabase
      .from('profiles')
      .insert({
        user_id: user.id,
        extracted_data: profile,
        source_file_name: file_name || 'resume.docx',
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 })
    }

    return NextResponse.json({ profile: profileRow })
  } catch (err) {
    console.error('Extract DOCX error:', err)
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
