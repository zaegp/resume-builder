'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import mammoth from 'mammoth'
import { createClient } from '@/lib/supabase/client'
import type { ExtractedProfile, ProfileRow, WorkExperience, Project, Education } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Upload,
  Plus,
  Trash2,
  Edit2,
  FileText,
  Briefcase,
  GraduationCap,
  Code,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  X,
} from 'lucide-react'

const PROFILE_LIMIT = 2

export default function ProfilePage() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const fetchProfiles = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setProfiles(data as ProfileRow[])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchProfiles()
  }, [fetchProfiles])

  async function handleUpload(file: File) {
    if (!file.name.endsWith('.docx')) {
      setUploadError('Only .docx files are accepted.')
      return
    }

    setUploading(true)
    setUploadError(null)

    try {
      // Extract text client-side with mammoth (avoids Vercel 4.5MB body limit)
      const arrayBuffer = await file.arrayBuffer()
      const { value: rawText } = await mammoth.extractRawText({ arrayBuffer })

      if (!rawText || rawText.trim().length < 50) {
        setUploadError("Couldn't extract text from this file. Please try a different .docx or enter manually.")
        return
      }

      const res = await fetch('/api/extract-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: rawText, file_name: file.name }),
      })

      const text = await res.text()
      let json: Record<string, unknown>
      try {
        json = JSON.parse(text)
      } catch {
        console.error('Non-JSON response:', res.status, text.slice(0, 500))
        setUploadError(`Server error (${res.status}): ${text.slice(0, 200)}`)
        return
      }

      if (!res.ok) {
        if (json.limit_reached) {
          setUploadError('Free tier limit reached: 2 profiles. Delete one to upload more.')
        } else if (json.fallback_manual) {
          setUploadError(
            'Could not fully extract your resume. Some fields may need manual editing.'
          )
          if (json.profile) {
            setProfiles((prev) => [json.profile as ProfileRow, ...prev])
          }
        } else {
          setUploadError((json.error as string) ?? 'Upload failed. Please try again.')
        }
      } else {
        setProfiles((prev) => [json.profile as ProfileRow, ...prev])
      }
    } catch (err) {
      console.error('Upload error:', err)
      setUploadError(err instanceof Error ? err.message : 'Network error. Please try again.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleUpload(file)
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
  }

  async function deleteProfile(id: string) {
    const { error } = await supabase.from('profiles').delete().eq('id', id)
    if (!error) {
      setProfiles((prev) => prev.filter((p) => p.id !== id))
      if (expandedId === id) setExpandedId(null)
    }
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  const atLimit = profiles.length >= PROFILE_LIMIT
  const showUpload = !atLimit && !loading

  // --- Render Helpers ---

  function renderUploadArea(large: boolean) {
    return (
      <div className="space-y-3">
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              fileInputRef.current?.click()
            }
          }}
          className={`
            relative flex cursor-pointer flex-col items-center justify-center
            rounded-lg border-2 border-dashed transition-colors
            ${large ? 'py-16' : 'py-10'}
            ${dragOver
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
            }
          `}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="animate-pulse">
                <FileText className="size-10 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Extracting resume data...</p>
              <div className="flex gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-full bg-primary/10 p-3">
                <Upload className="size-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium">
                  {large ? 'Upload your first resume to get started' : 'Upload a resume'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Drag and drop a .docx file, or click to browse
                </p>
              </div>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            onChange={onFileSelect}
            className="hidden"
          />
        </div>

        {uploadError && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{uploadError}</span>
            <button
              onClick={() => setUploadError(null)}
              className="ml-auto shrink-0"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>
    )
  }

  function renderProfileCard(profile: ProfileRow) {
    const data = profile.extracted_data
    const isExpanded = expandedId === profile.id
    const workCount = data.work?.length ?? 0
    const skillCount = data.skills?.length ?? 0
    const createdDate = new Date(profile.created_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

    return (
      <Card key={profile.id} className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <button
              className="flex-1 text-left"
              onClick={() => toggleExpand(profile.id)}
            >
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4 text-muted-foreground" />
                {profile.source_file_name ?? 'Uploaded Resume'}
              </CardTitle>
              <CardDescription className="mt-1">
                Uploaded {createdDate}
              </CardDescription>
            </button>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => toggleExpand(profile.id)}
                aria-label={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </Button>
              <Button
                variant="destructive"
                size="icon-sm"
                onClick={() => deleteProfile(profile.id)}
                aria-label="Delete profile"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="secondary">
              <Briefcase className="mr-1 size-3" />
              {workCount} experience{workCount !== 1 ? 's' : ''}
            </Badge>
            <Badge variant="secondary">
              <Code className="mr-1 size-3" />
              {skillCount} skill{skillCount !== 1 ? 's' : ''}
            </Badge>
            {(data.education?.length ?? 0) > 0 && (
              <Badge variant="secondary">
                <GraduationCap className="mr-1 size-3" />
                {data.education.length} education
              </Badge>
            )}
          </div>
        </CardHeader>

        {isExpanded && (
          <CardContent className="pt-0">
            <Separator className="mb-4" />
            {renderProfileDetail(data)}
          </CardContent>
        )}
      </Card>
    )
  }

  function renderProfileDetail(data: ExtractedProfile) {
    return (
      <div className="space-y-6">
        {/* Work Experience */}
        {data.work?.length > 0 && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Briefcase className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Work Experience</h3>
            </div>
            <div className="space-y-4">
              {data.work.map((w: WorkExperience, i: number) => (
                <div key={i} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{w.title}</p>
                      <p className="text-sm text-muted-foreground">{w.company}</p>
                    </div>
                    <p className="shrink-0 text-xs text-muted-foreground">
                      {w.start_date} &ndash; {w.end_date ?? 'Present'}
                    </p>
                  </div>
                  {w.bullets?.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {w.bullets.map((b: string, j: number) => (
                        <li key={j} className="text-sm text-muted-foreground">
                          <span className="mr-1.5 text-muted-foreground/60">&bull;</span>
                          {b}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Skills */}
        {data.skills?.length > 0 && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Code className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Skills</h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.skills.map((skill: string, i: number) => (
                <Badge key={i} variant="outline">
                  {skill}
                </Badge>
              ))}
            </div>
          </section>
        )}

        {/* Projects */}
        {data.projects?.length > 0 && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Code className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Projects</h3>
            </div>
            <div className="space-y-3">
              {data.projects.map((p: Project, i: number) => (
                <div key={i} className="rounded-md border p-3">
                  <p className="font-medium">{p.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                  {p.tech?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {p.tech.map((t: string, j: number) => (
                        <Badge key={j} variant="secondary" className="text-xs">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {p.outcomes && (
                    <p className="mt-1.5 text-xs text-muted-foreground italic">{p.outcomes}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Education */}
        {data.education?.length > 0 && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <GraduationCap className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Education</h3>
            </div>
            <div className="space-y-2">
              {data.education.map((e: Education, i: number) => (
                <div key={i} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{e.degree}</p>
                      <p className="text-sm text-muted-foreground">{e.school}</p>
                    </div>
                    <p className="shrink-0 text-xs text-muted-foreground">
                      {e.start_date} &ndash; {e.end_date}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    )
  }

  // --- Main Render ---

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Profile Builder</h1>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-48" />
                <Skeleton className="mt-2 h-4 w-32" />
                <div className="mt-3 flex gap-2">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-20" />
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (profiles.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Profile Builder</h1>
        <div className="mx-auto max-w-lg">
          {renderUploadArea(true)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Profile Builder</h1>
        {showUpload && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus className="mr-1.5 size-3.5" />
            Add Resume
          </Button>
        )}
      </div>

      {showUpload && renderUploadArea(false)}

      {atLimit && (
        <div className="flex items-center gap-2 rounded-md border border-muted-foreground/20 bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          <AlertCircle className="size-4 shrink-0" />
          Free tier: {PROFILE_LIMIT} profiles. Delete one to upload more.
        </div>
      )}

      <div className="space-y-3">
        {profiles.map(renderProfileCard)}
      </div>
    </div>
  )
}
