'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type {
  ResumeRow,
  ProfileRow,
  CoverLetterRow,
  ResumeTemplate,
  MatchCard,
  ExtractedProfile,
} from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  FileText,
  Download,
  Mail,
  Copy,
  Check,
  Loader2,
  ArrowLeft,
  Calendar,
  Languages,
  BarChart3,
} from 'lucide-react'

function scoreColor(percentage: number): string {
  if (percentage > 70) return 'text-green-600 dark:text-green-400'
  if (percentage >= 40) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

function scoreBadgeClasses(percentage: number): string {
  if (percentage > 70) return 'bg-green-500/10 text-green-600 dark:text-green-400'
  if (percentage >= 40) return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
  return 'bg-red-500/10 text-red-600 dark:text-red-400'
}

export default function OutputPage() {
  const searchParams = useSearchParams()
  const resumeId = searchParams.get('resume_id')
  const supabase = createClient()
  const printRef = useRef<HTMLDivElement>(null)

  const [resume, setResume] = useState<ResumeRow | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [template, setTemplate] = useState<ResumeTemplate>('classic')

  // Cover letter state
  const [coverLetter, setCoverLetter] = useState<string | null>(null)
  const [coverLetterLoading, setCoverLetterLoading] = useState(false)
  const [coverLetterError, setCoverLetterError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchData = useCallback(async () => {
    if (!resumeId) {
      setError('No resume_id provided.')
      setLoading(false)
      return
    }

    try {
      const { data: resumeData, error: resumeErr } = await supabase
        .from('resumes')
        .select('*')
        .eq('id', resumeId)
        .single()

      if (resumeErr || !resumeData) {
        throw new Error(resumeErr?.message ?? 'Resume not found.')
      }

      const row = resumeData as ResumeRow
      setResume(row)
      setTemplate(row.template ?? 'classic')

      // Fetch associated profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', row.profile_id)
        .single()

      if (profileData) {
        setProfile(profileData as ProfileRow)
      }

      // Check for existing cover letter
      const { data: clData } = await supabase
        .from('cover_letters')
        .select('*')
        .eq('resume_id', resumeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (clData) {
        setCoverLetter((clData as CoverLetterRow).content)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load resume.')
    } finally {
      setLoading(false)
    }
  }, [resumeId, supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ---- Actions ----

  function handlePrint() {
    window.print()
  }

  async function handleGenerateCoverLetter() {
    if (!resume) return

    setCoverLetterLoading(true)
    setCoverLetterError(null)

    try {
      const confirmedCards = resume.matched_experiences.filter(
        (c: MatchCard) => c.status === 'approved' || c.status === 'edited'
      )

      const res = await fetch('/api/cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmed_cards: confirmedCards,
          jd_text: resume.jd_text,
          language: resume.language,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'Failed to generate cover letter.')
      }

      const data = await res.json()
      setCoverLetter(data.content)
    } catch (e) {
      setCoverLetterError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setCoverLetterLoading(false)
    }
  }

  async function handleCopy() {
    if (!coverLetter) return
    await navigator.clipboard.writeText(coverLetter)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ---- Loading state ----

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    )
  }

  // ---- Error state ----

  if (error || !resume) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Resume Output</h1>
        <Card className="mx-auto max-w-lg">
          <CardHeader className="text-center">
            <CardTitle>Unable to load resume</CardTitle>
            <CardDescription>{error ?? 'Resume not found.'}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" render={<Link href="/dashboard/history" />}>
              <ArrowLeft className="size-4" />
              Back to history
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---- Derived data ----

  const profileData: ExtractedProfile | null = profile?.extracted_data ?? null
  const approvedCards = resume.matched_experiences.filter(
    (c: MatchCard) => c.status === 'approved' || c.status === 'edited'
  )

  // Group approved cards by source_work for the resume layout
  const experiencesBySource = new Map<string, MatchCard[]>()
  for (const card of approvedCards) {
    const source = card.source_work ?? 'Other Experience'
    if (!experiencesBySource.has(source)) {
      experiencesBySource.set(source, [])
    }
    experiencesBySource.get(source)!.push(card)
  }

  const formattedDate = new Date(resume.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  // ---- Render ----

  return (
    <div className="space-y-6">
      {/* Header controls - hidden when printing */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" render={<Link href="/dashboard/history" />}>
            <ArrowLeft className="size-4" />
            History
          </Button>
          <h1 className="text-2xl font-bold">Resume Output</h1>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={template}
            onValueChange={(val) => setTemplate(val as ResumeTemplate)}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="classic">Classic</SelectItem>
              <SelectItem value="modern">Modern</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={handlePrint}>
            <Download className="size-4" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Resume metadata - hidden when printing */}
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        {resume.jd_title && (
          <Badge variant="secondary" className="gap-1.5">
            <FileText className="size-3" />
            {resume.jd_title}
          </Badge>
        )}
        <Badge className={scoreBadgeClasses(resume.match_score)}>
          <BarChart3 className="size-3" />
          {resume.match_score}% match
        </Badge>
        <Badge variant="secondary" className="gap-1.5">
          <Languages className="size-3" />
          {resume.language === 'zh' ? 'Chinese' : 'English'}
        </Badge>
        <Badge variant="secondary" className="gap-1.5">
          <Calendar className="size-3" />
          {formattedDate}
        </Badge>
      </div>

      {/* Resume Preview */}
      <div
        ref={printRef}
        className={`
          mx-auto bg-white text-black shadow-lg print:shadow-none
          ${template === 'modern'
            ? 'max-w-[816px] rounded-lg border font-sans'
            : 'max-w-[816px] border font-serif'
          }
          print:max-w-none print:border-none print:m-0 print:rounded-none
        `}
      >
        <div className="p-8 print:p-[0.75in]">
          {/* Name and contact */}
          <header className={`mb-6 text-center ${template === 'modern' ? 'border-b-2 border-gray-800 pb-4' : 'border-b border-gray-300 pb-4'}`}>
            <h1 className={`font-bold text-black ${template === 'modern' ? 'text-2xl tracking-tight' : 'text-3xl'}`}>
              {profileData?.work?.[0]
                ? 'Your Name'
                : 'Your Name'
              }
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              email@example.com | (555) 000-0000 | City, State
            </p>
            {template === 'modern' && (
              <p className="mt-2 text-xs uppercase tracking-widest text-gray-500">
                {resume.jd_title ?? 'Professional Resume'}
              </p>
            )}
          </header>

          {/* Work Experience */}
          <section className="mb-6">
            <h2 className={`mb-3 font-bold uppercase tracking-wide text-black ${template === 'modern' ? 'text-sm border-b border-gray-300 pb-1' : 'text-base border-b-2 border-gray-800 pb-1'}`}>
              Professional Experience
            </h2>

            <div className="space-y-4">
              {Array.from(experiencesBySource.entries()).map(([source, cards]) => {
                // Try to find the matching work experience from profile
                const workEntry = profileData?.work?.find(
                  (w) => `${w.company} - ${w.title}` === source || w.company === source
                )

                return (
                  <div key={source}>
                    <div className="flex items-baseline justify-between">
                      <div>
                        <h3 className={`font-bold text-black ${template === 'modern' ? 'text-sm' : 'text-base'}`}>
                          {workEntry?.title ?? source.split(' - ')[1] ?? source}
                        </h3>
                        <p className={`text-gray-700 ${template === 'modern' ? 'text-xs' : 'text-sm'}`}>
                          {workEntry?.company ?? source.split(' - ')[0] ?? ''}
                        </p>
                      </div>
                      {workEntry && (
                        <p className={`text-gray-500 ${template === 'modern' ? 'text-xs' : 'text-sm'}`}>
                          {workEntry.start_date} &ndash; {workEntry.end_date ?? 'Present'}
                        </p>
                      )}
                    </div>

                    <ul className={`mt-1.5 list-disc pl-5 space-y-1 ${template === 'modern' ? 'text-xs leading-relaxed' : 'text-sm leading-relaxed'}`}>
                      {cards.map((card) => (
                        <li key={card.id} className="text-gray-800">
                          {card.edited_text ?? card.star_enhanced ?? card.original_bullet ?? ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Skills */}
          {profileData?.skills && profileData.skills.length > 0 && (
            <section className="mb-6">
              <h2 className={`mb-3 font-bold uppercase tracking-wide text-black ${template === 'modern' ? 'text-sm border-b border-gray-300 pb-1' : 'text-base border-b-2 border-gray-800 pb-1'}`}>
                Skills
              </h2>
              <p className={`text-gray-800 ${template === 'modern' ? 'text-xs leading-relaxed' : 'text-sm leading-relaxed'}`}>
                {profileData.skills.join(' \u2022 ')}
              </p>
            </section>
          )}

          {/* Education */}
          {profileData?.education && profileData.education.length > 0 && (
            <section className="mb-6">
              <h2 className={`mb-3 font-bold uppercase tracking-wide text-black ${template === 'modern' ? 'text-sm border-b border-gray-300 pb-1' : 'text-base border-b-2 border-gray-800 pb-1'}`}>
                Education
              </h2>
              <div className="space-y-2">
                {profileData.education.map((edu, i) => (
                  <div key={i} className="flex items-baseline justify-between">
                    <div>
                      <p className={`font-bold text-black ${template === 'modern' ? 'text-sm' : 'text-base'}`}>
                        {edu.degree}
                      </p>
                      <p className={`text-gray-700 ${template === 'modern' ? 'text-xs' : 'text-sm'}`}>
                        {edu.school}
                      </p>
                    </div>
                    <p className={`text-gray-500 ${template === 'modern' ? 'text-xs' : 'text-sm'}`}>
                      {edu.start_date} &ndash; {edu.end_date}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Projects */}
          {profileData?.projects && profileData.projects.length > 0 && (
            <section>
              <h2 className={`mb-3 font-bold uppercase tracking-wide text-black ${template === 'modern' ? 'text-sm border-b border-gray-300 pb-1' : 'text-base border-b-2 border-gray-800 pb-1'}`}>
                Projects
              </h2>
              <div className="space-y-3">
                {profileData.projects.map((proj, i) => (
                  <div key={i}>
                    <div className="flex items-baseline justify-between">
                      <p className={`font-bold text-black ${template === 'modern' ? 'text-sm' : 'text-base'}`}>
                        {proj.name}
                      </p>
                      {proj.tech.length > 0 && (
                        <p className={`text-gray-500 ${template === 'modern' ? 'text-xs' : 'text-sm'}`}>
                          {proj.tech.join(', ')}
                        </p>
                      )}
                    </div>
                    <p className={`text-gray-800 ${template === 'modern' ? 'text-xs leading-relaxed' : 'text-sm leading-relaxed'}`}>
                      {proj.description}
                      {proj.outcomes ? ` ${proj.outcomes}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Cover Letter Section - hidden when printing */}
      <div className="print:hidden">
        <Separator className="my-6" />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="size-5 text-primary" />
              Cover Letter
            </CardTitle>
            <CardDescription>
              Generate a tailored cover letter based on your matched experiences and the job description.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {coverLetter ? (
              <>
                <Textarea
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  className="min-h-64 resize-y font-sans text-sm leading-relaxed"
                />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? (
                      <>
                        <Check className="size-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="size-4" />
                        Copy to clipboard
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateCoverLetter}
                    disabled={coverLetterLoading}
                  >
                    {coverLetterLoading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Regenerating...
                      </>
                    ) : (
                      'Regenerate'
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <>
                {coverLetterError && (
                  <p className="text-sm text-destructive">{coverLetterError}</p>
                )}
                <Button
                  onClick={handleGenerateCoverLetter}
                  disabled={coverLetterLoading}
                >
                  {coverLetterLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Generating cover letter...
                    </>
                  ) : (
                    <>
                      <Mail className="size-4" />
                      Generate Cover Letter
                    </>
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
