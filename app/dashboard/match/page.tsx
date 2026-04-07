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
  Edit2,
  ChevronRight,
  FileText,
  Languages,
  BarChart3,
  Sparkles,
  AlertTriangle,
} from 'lucide-react'

type Step = 'input' | 'analyzing' | 'results'

type AnalysisPhase =
  | 'extracting_requirements'
  | 'matching_experiences'
  | 'generating_star'
  | 'done'

const PHASE_LABELS: Record<AnalysisPhase, string> = {
  extracting_requirements: 'Analyzing requirements...',
  matching_experiences: 'Matching experiences...',
  generating_star: 'Generating STAR format...',
  done: 'Complete!',
}

function scoreColor(percentage: number): string {
  if (percentage > 70) return 'text-green-600 dark:text-green-400'
  if (percentage >= 40) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

function scoreBorderColor(percentage: number): string {
  if (percentage > 70) return 'border-green-500'
  if (percentage >= 40) return 'border-yellow-500'
  return 'border-red-500'
}

function progressIndicatorColor(percentage: number): string {
  if (percentage > 70) return '[&_[data-slot=progress-indicator]]:bg-green-500'
  if (percentage >= 40) return '[&_[data-slot=progress-indicator]]:bg-yellow-500'
  return '[&_[data-slot=progress-indicator]]:bg-red-500'
}

export default function MatchPage() {
  const router = useRouter()
  const supabase = createClient()

  // Step 1: Input state
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(true)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [jdText, setJdText] = useState('')
  const [language, setLanguage] = useState<OutputLanguage>('en')

  // Step 2-3: Analysis state
  const [step, setStep] = useState<Step>('input')
  const [phase, setPhase] = useState<AnalysisPhase>('extracting_requirements')
  const [jdRequirements, setJdRequirements] = useState<JDRequirement[]>([])
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Card editing state
  const [editingCardId, setEditingCardId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  // Saving state
  const [saving, setSaving] = useState(false)

  // Fetch profiles
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

  // ---- Analysis flow ----

  async function handleAnalyze() {
    if (!selectedProfileId || !jdText.trim()) return

    setError(null)
    setStep('analyzing')
    setPhase('extracting_requirements')

    try {
      // Phase 1: Analyze JD
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

      // Phase 2: Match + rewrite
      setPhase('matching_experiences')

      // Brief pause so the user sees the phase change
      await new Promise((r) => setTimeout(r, 600))
      setPhase('generating_star')

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
        throw new Error(err.error ?? 'Failed to match and rewrite experiences.')
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

  // ---- Card actions ----

  function updateCard(cardId: string, updates: Partial<MatchCard>) {
    if (!matchResult) return
    setMatchResult({
      ...matchResult,
      cards: matchResult.cards.map((c) =>
        c.id === cardId ? { ...c, ...updates } : c
      ),
    })
  }

  function approveCard(cardId: string) {
    updateCard(cardId, { status: 'approved' })
  }

  function skipCard(cardId: string) {
    updateCard(cardId, { status: 'skipped' })
  }

  function startEditing(card: MatchCard) {
    setEditingCardId(card.id)
    setEditText(card.edited_text ?? card.star_enhanced ?? '')
  }

  function saveEdit(cardId: string) {
    updateCard(cardId, { status: 'edited', edited_text: editText })
    setEditingCardId(null)
    setEditText('')
  }

  function cancelEdit() {
    setEditingCardId(null)
    setEditText('')
  }

  // ---- Generate resume ----

  const approvedCards = matchResult?.cards.filter(
    (c) => c.status === 'approved' || c.status === 'edited'
  ) ?? []
  const allSkipped = matchResult !== null && approvedCards.length === 0

  async function handleGenerate() {
    if (!matchResult || !selectedProfileId || approvedCards.length === 0) return

    setSaving(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated.')

      const { data, error } = await supabase
        .from('resumes')
        .insert({
          user_id: user.id,
          profile_id: selectedProfileId,
          jd_text: jdText,
          jd_requirements: jdRequirements,
          matched_experiences: matchResult.cards,
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

  // ---- Render: Loading ----

  if (loadingProfiles) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">JD Matcher</h1>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-2 h-4 w-64" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-9 w-32" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---- Render: No profiles ----

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
            <Button render={<Link href="/dashboard/profile" />}>
              Upload a resume
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---- Render: Analyzing ----

  if (step === 'analyzing') {
    const phaseIndex = Object.keys(PHASE_LABELS).indexOf(phase)
    const totalPhases = Object.keys(PHASE_LABELS).length - 1 // exclude 'done'
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
            <CardDescription>
              This usually takes 10-20 seconds.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Progress value={progressValue}>
              <ProgressLabel>{PHASE_LABELS[phase]}</ProgressLabel>
              <ProgressValue />
            </Progress>

            <div className="space-y-3">
              {(Object.keys(PHASE_LABELS) as AnalysisPhase[])
                .filter((p) => p !== 'done')
                .map((p) => {
                  const idx = Object.keys(PHASE_LABELS).indexOf(p)
                  const currentIdx = Object.keys(PHASE_LABELS).indexOf(phase)
                  const isDone = idx < currentIdx
                  const isCurrent = idx === currentIdx

                  return (
                    <div
                      key={p}
                      className={`flex items-center gap-2 text-sm transition-opacity ${
                        isDone
                          ? 'text-muted-foreground'
                          : isCurrent
                            ? 'font-medium text-foreground'
                            : 'text-muted-foreground/50'
                      }`}
                    >
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

  // ---- Render: Results ----

  if (step === 'results' && matchResult) {
    const { match_score, cards } = matchResult
    const matchedCount = cards.filter((c) => c.matched).length
    const gapCount = cards.filter((c) => !c.matched).length

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Match Results</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setStep('input')
              setMatchResult(null)
              setJdRequirements([])
            }}
          >
            Start over
          </Button>
        </div>

        {/* Score Dashboard */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
              <div className="flex items-center gap-3">
                <div className={`rounded-full border-4 p-3 ${scoreBorderColor(match_score.percentage)}`}>
                  <BarChart3 className={`size-6 ${scoreColor(match_score.percentage)}`} />
                </div>
                <div>
                  <p className={`text-2xl font-bold tabular-nums ${scoreColor(match_score.percentage)}`}>
                    {match_score.percentage}%
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {match_score.matched} of {match_score.total} requirements matched
                  </p>
                </div>
              </div>

              <div className="flex-1">
                <Progress
                  value={match_score.percentage}
                  className={progressIndicatorColor(match_score.percentage)}
                >
                  <ProgressLabel className="sr-only">Match score</ProgressLabel>
                </Progress>
              </div>

              <div className="flex gap-3">
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="size-3 text-green-500" />
                  {matchedCount} matched
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <XCircle className="size-3 text-red-500" />
                  {gapCount} gaps
                </Badge>
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

        {/* Match Cards */}
        <div className="space-y-4">
          {cards.map((card) => (
            <MatchCardView
              key={card.id}
              card={card}
              isEditing={editingCardId === card.id}
              editText={editText}
              onEditTextChange={setEditText}
              onApprove={() => approveCard(card.id)}
              onSkip={() => skipCard(card.id)}
              onStartEdit={() => startEditing(card)}
              onSaveEdit={() => saveEdit(card.id)}
              onCancelEdit={cancelEdit}
            />
          ))}
        </div>

        {/* Generate button */}
        <Separator />

        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            {approvedCards.length} experience{approvedCards.length !== 1 ? 's' : ''} selected
          </div>

          <div className="flex items-center gap-3">
            {allSkipped && (
              <div className="flex items-center gap-1.5 text-sm text-yellow-600 dark:text-yellow-400">
                <AlertTriangle className="size-4" />
                Select at least one experience to include
              </div>
            )}
            <Button
              size="lg"
              disabled={allSkipped || saving}
              onClick={handleGenerate}
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
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ---- Render: Input form (Step 1) ----

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
            Paste a job description and we will identify which of your experiences match,
            then rewrite them in STAR format tailored to the role.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Profile selector */}
          <div className="space-y-2">
            <Label htmlFor="profile-select">Resume profile</Label>
            <Select
              value={selectedProfileId ?? undefined}
              onValueChange={(val) => setSelectedProfileId(val as string)}
            >
              <SelectTrigger className="w-full" id="profile-select">
                <SelectValue placeholder="Select a profile" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <FileText className="size-3.5 text-muted-foreground" />
                    {p.source_file_name ?? 'Uploaded Resume'}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {p.extracted_data.work?.length ?? 0} experiences
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* JD textarea */}
          <div className="space-y-2">
            <Label htmlFor="jd-textarea">Job description</Label>
            <Textarea
              id="jd-textarea"
              placeholder="Paste the full job description here..."
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              className="min-h-48 resize-y"
            />
            <p className="text-xs text-muted-foreground">
              {jdText.length > 0
                ? `${jdText.split(/\s+/).filter(Boolean).length} words`
                : 'Include responsibilities, requirements, and qualifications for the best results.'}
            </p>
          </div>

          {/* Language selector */}
          <div className="space-y-2">
            <Label htmlFor="language-select" className="flex items-center gap-1.5">
              <Languages className="size-3.5" />
              Output language
            </Label>
            <Select
              value={language}
              onValueChange={(val) => setLanguage(val as OutputLanguage)}
            >
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

          {/* Analyze button */}
          <Button
            size="lg"
            disabled={!selectedProfileId || !jdText.trim()}
            onClick={handleAnalyze}
            className="w-full sm:w-auto"
          >
            <Sparkles className="size-4" />
            Analyze
            <ChevronRight className="size-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ---- Match Card Component ----

function MatchCardView({
  card,
  isEditing,
  editText,
  onEditTextChange,
  onApprove,
  onSkip,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
}: {
  card: MatchCard
  isEditing: boolean
  editText: string
  onEditTextChange: (text: string) => void
  onApprove: () => void
  onSkip: () => void
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
}) {
  const isSkipped = card.status === 'skipped'

  // Gap card
  if (!card.matched) {
    return (
      <Card className={`border-l-4 border-l-red-500 ${isSkipped ? 'opacity-50' : ''}`}>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {card.requirement.category}
                </Badge>
                <Badge variant="destructive" className="gap-1 text-xs">
                  <XCircle className="size-3" />
                  Gap
                </Badge>
              </div>
              <p className="text-sm font-medium">{card.requirement.description}</p>
              <p className="text-sm text-muted-foreground">
                No matching experience found
              </p>
            </div>
            <Button variant="outline" size="sm" render={<Link href="/dashboard/profile" />}>
              Add experience
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Matched card
  const displayText = card.edited_text ?? card.star_enhanced ?? ''
  const needsMetric = !!(card as MatchCard & { needs_metric?: boolean }).needs_metric

  return (
    <Card className={`${isSkipped ? 'opacity-50' : ''} ${card.status === 'approved' || card.status === 'edited' ? 'border-l-4 border-l-green-500' : ''}`}>
      <CardContent className="pt-6 space-y-4">
        {/* Requirement header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-xs">
                {card.requirement.category}
              </Badge>
              {card.status === 'approved' && (
                <Badge className="gap-1 bg-green-500/10 text-green-600 dark:text-green-400 text-xs">
                  <CheckCircle2 className="size-3" />
                  Approved
                </Badge>
              )}
              {card.status === 'edited' && (
                <Badge className="gap-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs">
                  <Edit2 className="size-3" />
                  Edited
                </Badge>
              )}
              {card.status === 'skipped' && (
                <Badge className="gap-1 bg-muted text-muted-foreground text-xs">
                  <XCircle className="size-3" />
                  Skipped
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium">{card.requirement.description}</p>
          </div>
        </div>

        {/* Source attribution */}
        {card.source_work && (
          <p className="text-xs text-muted-foreground">
            Source: {card.source_work}
          </p>
        )}

        {/* Metric banner */}
        {needsMetric && !isEditing && (
          <div className="flex items-start gap-2 rounded-md bg-yellow-500/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-400">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              Can you add a specific outcome? e.g., percentage, number of users, time saved
            </span>
          </div>
        )}

        {/* Two-column comparison */}
        {isEditing ? (
          <div className="space-y-3">
            <Label>Edit STAR-enhanced text</Label>
            <Textarea
              value={editText}
              onChange={(e) => onEditTextChange(e.target.value)}
              className="min-h-24 resize-y"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={onSaveEdit}>
                Save
              </Button>
              <Button variant="outline" size="sm" onClick={onCancelEdit}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Your experience
              </p>
              <p className="text-sm leading-relaxed">{card.original_bullet}</p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                STAR-enhanced
              </p>
              <p className="text-sm leading-relaxed">{displayText}</p>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!isEditing && (
          <>
            <Separator />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={card.status === 'approved' || card.status === 'edited' ? 'default' : 'outline'}
                onClick={onApprove}
              >
                <CheckCircle2 className="size-3.5" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={onStartEdit}
              >
                <Edit2 className="size-3.5" />
                Edit
              </Button>
              <Button
                size="sm"
                variant={card.status === 'skipped' ? 'destructive' : 'ghost'}
                onClick={onSkip}
              >
                <XCircle className="size-3.5" />
                Skip
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
