import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { extractFromDocx } from '@/lib/ai/extract-docx'
import mammoth from 'mammoth'

// Vercel serverless config: increase timeout and body size
export const maxDuration = 60 // seconds
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit
    const { success: withinLimit } = await checkRateLimit(user.id)
    if (!withinLimit) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 })
    }

    // Check profile count limit (free tier: 2)
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

    // Parse the uploaded file
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    if (!file.name.endsWith('.docx')) {
      return NextResponse.json({ error: 'Please upload a .docx file' }, { status: 400 })
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum 5MB.' }, { status: 400 })
    }

    // Extract text with mammoth
    const buffer = Buffer.from(await file.arrayBuffer())
    const { value: rawText } = await mammoth.extractRawText({ buffer })

    if (!rawText || rawText.trim().length < 50) {
      return NextResponse.json({
        error: "Couldn't extract text from this file. Please enter your information manually.",
        fallback_manual: true
      }, { status: 422 })
    }

    // AI extraction
    const profile = await extractFromDocx(rawText)

    // Save to database
    const { data: profileRow, error: dbError } = await supabase
      .from('profiles')
      .insert({
        user_id: user.id,
        extracted_data: profile,
        source_file_name: file.name,
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
