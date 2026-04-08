import OpenAI from 'openai'
import { sanitizeUserContent } from '@/lib/sanitize'
import type { ExtractedProfile, JDRequirement, MatchResult, OutputLanguage } from '@/lib/types'

const client = new OpenAI()

export async function matchAndRewrite(
  requirements: JDRequirement[],
  profile: ExtractedProfile,
  language: OutputLanguage
): Promise<MatchResult> {
  const langInstruction = language === 'zh'
    ? 'Respond in Chinese (Traditional Chinese / 繁體中文). Keep company names and technical terms in English.'
    : 'Respond in English.'

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a resume matching expert. Your job is to align the candidate's existing experiences to job requirements. Find the best matching bullet point from the candidate's resume for each JD requirement.

CRITICAL RULES:
- Do NOT rewrite, rephrase, or enhance any bullet points. Return the original text exactly as-is.
- Match each requirement to the single most relevant experience bullet from the candidate's resume.
- If multiple bullets match, pick the strongest one.
- If no experience matches a requirement, set matched to false.
- The original_bullet field must contain the EXACT text from the candidate's resume, unchanged.
${langInstruction}`
      },
      {
        role: 'user',
        content: `${sanitizeUserContent(JSON.stringify(requirements), 'jd_requirements')}

${sanitizeUserContent(JSON.stringify(profile), 'candidate_profile')}

For each job requirement, find the best matching experience bullet from the candidate's profile. Return the original bullet text exactly as written — do not modify it.`
      }
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'match_experiences',
          description: 'Match candidate experiences to JD requirements',
          parameters: {
            type: 'object',
            properties: {
              cards: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    requirement_index: { type: 'number', description: 'Index of the JD requirement' },
                    matched: { type: 'boolean' },
                    original_bullet: { type: ['string', 'null'], description: 'Exact original text from resume, unchanged' },
                    source_work: { type: ['string', 'null'], description: 'Company + Title where this experience is from' }
                  },
                  required: ['requirement_index', 'matched']
                }
              },
              match_score: {
                type: 'object',
                properties: {
                  matched: { type: 'number' },
                  total: { type: 'number' },
                  percentage: { type: 'number' }
                },
                required: ['matched', 'total', 'percentage']
              }
            },
            required: ['cards', 'match_score']
          }
        }
      }
    ],
    tool_choice: { type: 'function', function: { name: 'match_experiences' } }
  })

  const toolCall = response.choices[0]?.message?.tool_calls?.[0]
  if (!toolCall || toolCall.type !== 'function' || toolCall.function.name !== 'match_experiences') {
    throw new Error('AI did not return match results')
  }

  const result = JSON.parse(toolCall.function.arguments) as {
    cards: Array<{
      requirement_index: number
      matched: boolean
      original_bullet: string | null
      source_work: string | null
    }>
    match_score: { matched: number; total: number; percentage: number }
  }

  const cards = result.cards.map((card, i) => ({
    id: `card-${i}`,
    requirement: requirements[card.requirement_index] || requirements[0],
    matched: card.matched,
    original_bullet: card.original_bullet,
    star_enhanced: null,
    source_work: card.source_work,
    status: 'approved' as const,
    edited_text: null
  }))

  return {
    cards,
    match_score: result.match_score
  }
}
