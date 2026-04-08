'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type {
  ProfileRow,
  JDRequirement,
  MatchCard,
  MatchResult,
  OutputLanguage,
} from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'
import {
  CheckCircle2,
  XCircle,
  ChevronRight,
  FileText,
  Languages,
  BarChart3,
  Sparkles,
  AlertTriangle,
  Check,
  Minus,
} from 'lucide-react'

type Step = 'input' | 'analyzing' | 'results'

type AnalysisPhase =
  | 'extracting_requirements'
  | 'matching_experiences'
  | 'done'

const PHASE_LABELS: Record<AnalysisPhase, string> = {
  extracting_requirements: 'Analyzing requirements...',
  matching_experiences: 'Matching experiences...',
  done: 'Complete!',
}

function scoreColor(percentage: number): string {
  if (percentage > 70) return 'text-green-600 dark:text-green-400'
  if (percentage >= 40) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

function scoreBg(percentage: number): string {
  if (percentage > 70) return 'bg-green-500/10'
  if (percentage >= 40) return 'bg-yellow-500/10'
  return 'bg-red-500/10'
}

function progressIndicatorColor(percentage: number): string {
  if (percentage > 70) return '[&_[data-slot=progress-indicator]]:bg-green-500'
  if (percentage >= 40) return '[&_[data-slot=progress-indicator]]:bg-yellow-500'
  return '[&_[data-slot=progress-indicator]]:bg-red-500'
}

export default function MatchPage() {
  const router = useRouter()
  const supabase = createClient()

  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(true)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [jdText, setJdText] = useState('')
  const [language, setLanguage] = useState<OutputLanguage>('en')

  const [step, setStep] = useState<Step>('input')
  const [phase, setPhase] = useState<AnalysisPhase>('extracting_requirements')
  const [jdRequirements, setJdRequirements] = useState<JDRequirement[]>([])
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Track which matched items are included (all included by default)
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())

  // Gap fill state
  const [expandedGapId, setExpandedGapId] = useState<string | null>(null)
  const [gapInput, setGapInput] = useState('')
  const [polishing, setPolishing] = useState(false)
  const [polishedText, setPolishedText] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)

  const fetchProfiles = useCallback(async () => {
    setLoadingProfiles(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (!error && data) {
      const rows = data as ProfileRow[]
      setProfiles(rows)
      if (rows.length === 1) {
        setSelectedProfileId(rows[0].id)
      }
    }
    setLoadingProfiles(false)
  }, [supabase])

  useEffect(() => {
    fetchProfiles()
  }, [fetchProfiles])

  // Analysis flow
  async function handleAnalyze() {
    if (!selectedProfileId || !jdText.trim()) return

    setError(null)
    setStep('analyzing')
    setPhase('extracting_requirements')
    setExcludedIds(new Set())

    try {
      const jdRes = await fetch('/api/analyze-jd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jd_text: jdText }),
      })

      if (!jdRes.ok) {
        const err = await jdRes.json().catch(() => ({}))
        throw new Error(err.error ?? 'Failed to analyze job description.')
      }

      const jdData = await jdRes.json()
      const requirements: JDRequirement[] = jdData.requirements
      setJdRequirements(requirements)

      setPhase('matching_experiences')

      const matchRes = await fetch('/api/match-rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requirements,
          profile_id: selectedProfileId,
          language,
        }),
      })

      if (!matchRes.ok) {
        const err = await matchRes.json().catch(() => ({}))
        throw new Error(err.error ?? 'Failed to match experiences.')
      }

      const result: MatchResult = await matchRes.json()
      setMatchResult(result)
      setPhase('done')
      setStep('results')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
      setStep('input')
    }
  }

  function toggleInclude(cardId: string) {
    setExcludedIds(prev => {
      const next = new Set(prev)
      if (next.has(cardId)) {
        next.delete(cardId)
      } else {
        next.add(cardId)
      }
      return next
    })
  }

  // Gap fill: polish rough text with AI
  async function handlePolish(requirementDesc: string) {
    if (!gapInput.trim()) return
    setPolishing(true)
    setPolishedText(null)
    try {
      const res = await fetch('/api/polish-bullet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rough_text: gapInput,
          requirement: requirementDesc,
          language,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPolishedText(data.polished)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to polish text.')
    } finally {
      setPolishing(false)
    }
  }

  // Gap fill: save polished bullet to profile + add as matched card
  async function handleSaveGapFill(card: MatchCard) {
    if (!polishedText || !selectedProfileId || !matchResult) return

    try {
      // Fetch current profile
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('extracted_data')
        .eq('id', selectedProfileId)
        .single()

      if (!profileRow) throw new Error('Profile not found')

      const profileData = profileRow.extracted_data as import('@/lib/types').ExtractedProfile

      // Add the new bullet to the first work entry
      if (profileData.work.length > 0) {
        profileData.work[0].bullets.push(polishedText)
      }

      // Update profile in DB
      await supabase
        .from('profiles')
        .update({ extracted_data: profileData })
        .eq('id', selectedProfileId)

      // Convert this gap card to a matched card in the result
      const newCards = matchResult.cards.map(c =>
        c.id === card.id
          ? { ...c, matched: true, original_bullet: polishedText, source_work: profileData.work[0]?.company + ' — ' + profileData.work[0]?.title }
          : c
      )

      const newMatchedCount = newCards.filter(c => c.matched).length
      setMatchResult({
        cards: newCards,
        match_score: {
          matched: newMatchedCount,
          total: matchResult.match_score.total,
          percentage: Math.round((newMatchedCount / matchResult.match_score.total) * 100),
        },
      })

      // Reset gap fill state
      setExpandedGapId(null)
      setGapInput('')
      setPolishedText(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save experience.')
    }
  }

  // Generate resume
  const matchedCards = matchResult?.cards.filter(c => c.matched) ?? []
  const gapCards = matchResult?.cards.filter(c => !c.matched) ?? []
  const includedCards = matchedCards.filter(c => !excludedIds.has(c.id))

  async function handleGenerate() {
    if (!matchResult || !selectedProfileId || includedCards.length === 0) return

    setSaving(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated.')

      // Mark included cards as approved, excluded as skipped
      const finalCards = matchResult.cards.map(c => ({
        ...c,
        status: (!c.matched || excludedIds.has(c.id)) ? 'skipped' as const : 'approved' as const,
      }))

      const { data, error } = await supabase
        .from('resumes')
        .insert({
          user_id: user.id,
          profile_id: selectedProfileId,
          jd_text: jdText,
          jd_requirements: jdRequirements,
          matched_experiences: finalCards,
          match_score: matchResult.match_score.percentage,
          language,
        })
        .select('id')
        .single()

      if (error) throw new Error(error.message)

      router.push(`/dashboard/output?resume_id=${data.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save resume.')
      setSaving(false)
    }
  }

  // ---- Loading ----
  if (loadingProfiles) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">JD Matcher</h1>
        <Card>
          <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
          <CardContent><Skeleton className="h-32 w-full" /></CardContent>
        </Card>
      </div>
    )
  }

  // ---- No profiles ----
  if (profiles.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">JD Matcher</h1>
        <Card className="mx-auto max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 rounded-full bg-muted p-3">
              <FileText className="size-6 text-muted-foreground" />
            </div>
            <CardTitle>No profiles yet</CardTitle>
            <CardDescription>
              Upload a resume first so we can match your experience to job descriptions.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Link href="/dashboard/profile" className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Upload a resume
              <ChevronRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---- Analyzing ----
  if (step === 'analyzing') {
    const phaseIndex = Object.keys(PHASE_LABELS).indexOf(phase)
    const totalPhases = Object.keys(PHASE_LABELS).length - 1
    const progressValue = Math.round(((phaseIndex + 1) / totalPhases) * 100)

    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">JD Matcher</h1>
        <Card className="mx-auto max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2">
              <Sparkles className="size-8 text-primary animate-pulse" />
            </div>
            <CardTitle>Analyzing your match</CardTitle>
            <CardDescription>This usually takes 10-20 seconds.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Progress value={progressValue}>
              <ProgressLabel>{PHASE_LABELS[phase]}</ProgressLabel>
              <ProgressValue />
            </Progress>
            <div className="space-y-3">
              {(Object.keys(PHASE_LABELS) as AnalysisPhase[])
                .filter(p => p !== 'done')
                .map(p => {
                  const idx = Object.keys(PHASE_LABELS).indexOf(p)
                  const currentIdx = Object.keys(PHASE_LABELS).indexOf(phase)
                  const isDone = idx < currentIdx
                  const isCurrent = idx === currentIdx
                  return (
                    <div key={p} className={`flex items-center gap-2 text-sm ${isDone ? 'text-muted-foreground' : isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground/50'}`}>
                      {isDone ? (
                        <CheckCircle2 className="size-4 text-green-500" />
                      ) : isCurrent ? (
                        <div className="size-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                      ) : (
                        <div className="size-4 rounded-full border-2 border-muted-foreground/30" />
                      )}
                      {PHASE_LABELS[p]}
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---- Results ----
  if (step === 'results' && matchResult) {
    const { match_score } = matchResult

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Match Results</h1>
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
            onClick={() => { setStep('input'); setMatchResult(null); setJdRequirements([]) }}
          >
            Start over
          </button>
        </div>

        {/* Score Dashboard */}
        <Card className={scoreBg(match_score.percentage)}>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
              <div className="flex items-center gap-3">
                <BarChart3 className={`size-8 ${scoreColor(match_score.percentage)}`} />
                <div>
                  <p className={`text-3xl font-bold tabular-nums ${scoreColor(match_score.percentage)}`}>
                    {match_score.percentage}%
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {match_score.matched} of {match_score.total} requirements matched
                  </p>
                </div>
              </div>
              <div className="flex-1">
                <Progress value={match_score.percentage} className={progressIndicatorColor(match_score.percentage)}>
                  <ProgressLabel className="sr-only">Match score</ProgressLabel>
                </Progress>
              </div>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Matched experiences — auto-included, toggle to exclude */}
        {matchedCards.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <CheckCircle2 className="size-5 text-green-500" />
                Matched ({matchedCards.length})
              </h2>
              <p className="text-sm text-muted-foreground">
                Uncheck items you don&apos;t want in your resume
              </p>
            </div>
            <div className="space-y-2">
              {matchedCards.map(card => {
                const included = !excludedIds.has(card.id)
                return (
                  <div
                    key={card.id}
                    className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                      included ? 'border-green-500/30 bg-green-500/5' : 'border-border opacity-50'
                    }`}
                    onClick={() => toggleInclude(card.id)}
                  >
                    <div className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border ${
                      included ? 'border-green-500 bg-green-500 text-white' : 'border-muted-foreground/30'
                    }`}>
                      {included && <Check className="size-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="text-xs shrink-0">
                          {card.requirement.category}
                        </Badge>
                        <span className="text-sm font-medium truncate">{card.requirement.description}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{card.original_bullet}</p>
                      {card.source_work && (
                        <p className="text-xs text-muted-foreground/70 mt-1">From: {card.source_work}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Gaps — what's missing, with inline add */}
        {gapCards.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Minus className="size-5 text-red-500" />
              Gaps ({gapCards.length})
            </h2>
            <p className="text-sm text-muted-foreground">
              Click &quot;Add Experience&quot; to quickly fill a gap. Describe what you did and AI will polish it.
            </p>
            <div className="space-y-2">
              {gapCards.map(card => {
                const isExpanded = expandedGapId === card.id
                return (
                  <div key={card.id} className="rounded-lg border border-red-500/20 bg-red-500/5 overflow-hidden">
                    <div className="flex items-start gap-3 p-4">
                      <XCircle className="mt-0.5 size-5 shrink-0 text-red-500" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary" className="text-xs">
                            {card.requirement.category}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium">{card.requirement.description}</p>
                      </div>
                      {!isExpanded && (
                        <button
                          type="button"
                          className="shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
                          onClick={() => {
                            setExpandedGapId(card.id)
                            setGapInput('')
                            setPolishedText(null)
                          }}
                        >
                          + Add Experience
                        </button>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="border-t border-red-500/10 bg-background p-4 space-y-3">
                        <Label className="text-sm">Briefly describe your relevant experience</Label>
                        <Textarea
                          placeholder="e.g. I used React to build an internal dashboard at my previous company..."
                          value={gapInput}
                          onChange={e => { setGapInput(e.target.value); setPolishedText(null) }}
                          className="min-h-20 resize-y"
                        />

                        {!polishedText && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={!gapInput.trim() || polishing}
                              onClick={() => handlePolish(card.requirement.description)}
                              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                              {polishing ? (
                                <>
                                  <div className="size-3 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                                  Polishing...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="size-3" />
                                  Polish with AI
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                              onClick={() => { setExpandedGapId(null); setGapInput(''); setPolishedText(null) }}
                            >
                              Cancel
                            </button>
                          </div>
                        )}

                        {polishedText && (
                          <div className="space-y-3">
                            <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3">
                              <p className="text-xs font-medium text-muted-foreground mb-1">AI-polished version:</p>
                              <p className="text-sm">{polishedText}</p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleSaveGapFill(card)}
                                className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                              >
                                <Check className="size-3" />
                                Use this & add to resume
                              </button>
                              <button
                                type="button"
                                onClick={() => setPolishedText(null)}
                                className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                              >
                                Try again
                              </button>
                              <button
                                type="button"
                                className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
                                onClick={() => { setExpandedGapId(null); setGapInput(''); setPolishedText(null) }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Generate */}
        <Separator />
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {includedCards.length} experience{includedCards.length !== 1 ? 's' : ''} will be included in your resume
          </p>
          <button
            type="button"
            disabled={includedCards.length === 0 || saving}
            onClick={handleGenerate}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
          >
            {saving ? (
              <>
                <div className="size-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Generate Resume
              </>
            )}
          </button>
        </div>
        {includedCards.length === 0 && (
          <p className="text-sm text-yellow-600 dark:text-yellow-400 flex items-center gap-1.5">
            <AlertTriangle className="size-4" />
            Include at least one experience to generate a resume
          </p>
        )}
      </div>
    )
  }

  // ---- Input form ----
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">JD Matcher</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            Match your experience to a job description
          </CardTitle>
          <CardDescription>
            Paste a job description and we&apos;ll show which of your experiences match
            and what gaps you need to fill.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="profile-select">Resume profile</Label>
            <Select
              value={selectedProfileId ?? undefined}
              onValueChange={val => setSelectedProfileId(val)}
            >
              <SelectTrigger className="w-full" id="profile-select">
                <SelectValue placeholder="Select a profile" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.source_file_name ?? 'Uploaded Resume'} ({p.extracted_data.work?.length ?? 0} experiences)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="jd-textarea">Job description</Label>
            <Textarea
              id="jd-textarea"
              placeholder="Paste the full job description here..."
              value={jdText}
              onChange={e => setJdText(e.target.value)}
              className="min-h-48 resize-y"
            />
            <p className="text-xs text-muted-foreground">
              {jdText.length > 0
                ? `${jdText.split(/\s+/).filter(Boolean).length} words`
                : 'Include responsibilities, requirements, and qualifications for the best results.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="language-select" className="flex items-center gap-1.5">
              <Languages className="size-3.5" />
              Output language
            </Label>
            <Select value={language} onValueChange={val => setLanguage(val as OutputLanguage)}>
              <SelectTrigger className="w-48" id="language-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="zh">Chinese</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="button"
            disabled={!selectedProfileId || !jdText.trim()}
            onClick={handleAnalyze}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
          >
            <Sparkles className="size-4" />
            Analyze
            <ChevronRight className="size-4" />
          </button>
        </CardContent>
      </Card>
    </div>
  )
}
