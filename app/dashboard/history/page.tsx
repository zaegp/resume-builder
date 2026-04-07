'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { ResumeRow } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  FileText,
  Trash2,
  Eye,
  AlertTriangle,
  Languages,
  Calendar,
  BarChart3,
  Sparkles,
} from 'lucide-react'

const FREE_TIER_LIMIT = 3

function scoreColor(percentage: number): string {
  if (percentage > 70) return 'bg-green-500/10 text-green-600 dark:text-green-400'
  if (percentage >= 40) return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
  return 'bg-red-500/10 text-red-600 dark:text-red-400'
}

export default function HistoryPage() {
  const router = useRouter()
  const supabase = createClient()

  const [resumes, setResumes] = useState<ResumeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [waitlistDone, setWaitlistDone] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  const fetchResumes = useCallback(async () => {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setUserEmail(user.email ?? null)

    const { data, error } = await supabase
      .from('resumes')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setResumes(data as ResumeRow[])
    }

    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchResumes()
  }, [fetchResumes])

  async function handleDelete(id: string) {
    setDeleting(id)
    const { error } = await supabase.from('resumes').delete().eq('id', id)
    if (!error) {
      setResumes((prev) => prev.filter((r) => r.id !== id))
    }
    setDeleting(null)
  }

  async function handleJoinWaitlist() {
    if (!userEmail) return
    setWaitlistLoading(true)
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail }),
      })
      if (res.ok) {
        setWaitlistDone(true)
      }
    } catch {
      // silently fail
    } finally {
      setWaitlistLoading(false)
    }
  }

  const atLimit = resumes.length >= FREE_TIER_LIMIT

  // ---- Loading state ----

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">My Resumes</h1>
        <Skeleton className="h-5 w-40" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-64" />
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-5 w-12" />
                      <Skeleton className="h-5 w-24" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // ---- Empty state ----

  if (resumes.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">My Resumes</h1>
        <Card className="mx-auto max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 rounded-full bg-muted p-3">
              <FileText className="size-6 text-muted-foreground" />
            </div>
            <CardTitle>No resumes yet</CardTitle>
            <CardDescription>
              Go to Match to create your first tailored resume.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button render={<Link href="/dashboard/match" />}>
              <Sparkles className="size-4" />
              Create a resume
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---- Resume list ----

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Resumes</h1>
        <p className="text-sm text-muted-foreground">
          {resumes.length} of {FREE_TIER_LIMIT} resumes used
        </p>
      </div>

      {/* At-limit warning */}
      {atLimit && (
        <div className="flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-yellow-600 dark:text-yellow-400" />
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
              Free tier: {FREE_TIER_LIMIT} resumes. Delete one to create more, or join the waitlist for unlimited ($5/mo).
            </p>
            {waitlistDone ? (
              <p className="text-sm text-muted-foreground">
                You&apos;re on the waitlist. We&apos;ll notify you at {userEmail}.
              </p>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleJoinWaitlist}
                disabled={waitlistLoading}
              >
                {waitlistLoading ? 'Joining...' : 'Join waitlist'}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Resume cards */}
      <div className="space-y-4">
        {resumes.map((resume) => {
          const title = resume.jd_title
            ?? (resume.jd_text.length > 60
              ? resume.jd_text.substring(0, 60) + '...'
              : resume.jd_text)
          const date = new Date(resume.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })

          return (
            <Card key={resume.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <p className="truncate font-medium">{title}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={scoreColor(resume.match_score)}>
                        <BarChart3 className="size-3" />
                        {resume.match_score}%
                      </Badge>
                      <Badge variant="secondary" className="gap-1">
                        <Languages className="size-3" />
                        {resume.language === 'zh' ? 'ZH' : 'EN'}
                      </Badge>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="size-3" />
                        {date}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      render={<Link href={`/dashboard/output?resume_id=${resume.id}`} />}
                    >
                      <Eye className="size-3.5" />
                      View
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deleting === resume.id}
                      onClick={() => handleDelete(resume.id)}
                    >
                      {deleting === resume.id ? (
                        <div className="size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
