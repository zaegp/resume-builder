// Profile extracted from DOCX resume
export interface WorkExperience {
  company: string
  title: string
  start_date: string
  end_date: string | null
  bullets: string[]
}

export interface Project {
  name: string
  description: string
  tech: string[]
  outcomes: string
}

export interface Education {
  school: string
  degree: string
  start_date: string
  end_date: string
}

export interface ExtractedProfile {
  work: WorkExperience[]
  skills: string[]
  projects: Project[]
  education: Education[]
}

// JD Analysis
export interface JDRequirement {
  category: string // e.g., "skills", "experience", "qualification"
  description: string
  keywords: string[]
}

// Match result from AI
export interface MatchCard {
  id: string
  requirement: JDRequirement
  matched: boolean
  original_bullet: string | null
  star_enhanced: string | null
  source_work: string | null // company + title for attribution
  status: 'approved' | 'edited' | 'skipped'
  edited_text: string | null
}

export interface MatchResult {
  cards: MatchCard[]
  match_score: { matched: number; total: number; percentage: number }
}

// Database row types
export interface ProfileRow {
  id: string
  user_id: string
  extracted_data: ExtractedProfile
  source_file_name: string | null
  created_at: string
  updated_at: string
}

export interface ResumeRow {
  id: string
  user_id: string
  profile_id: string
  jd_text: string
  jd_title: string | null
  jd_requirements: JDRequirement[]
  matched_experiences: MatchCard[]
  match_score: number
  language: 'en' | 'zh'
  template: 'classic' | 'modern'
  created_at: string
}

export interface CoverLetterRow {
  id: string
  resume_id: string
  content: string
  language: 'en' | 'zh'
  created_at: string
}

export type OutputLanguage = 'en' | 'zh'
export type ResumeTemplate = 'classic' | 'modern'
