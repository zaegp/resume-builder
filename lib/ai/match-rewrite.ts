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
    ? 'Write all STAR-enhanced bullets in Chinese (Traditional Chinese / 繁體中文). Keep company names and technical terms in English.'
    : 'Write all STAR-enhanced bullets in English.'

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a professional resume consultant. Match the candidate's experiences to job requirements and rewrite bullet points using STAR format (Situation, Task, Action, Result).

CRITICAL RULES:
- You can ONLY rephrase and structure what the candidate provided.
- NEVER add metrics, technologies, or achievements not in the original resume.
- If a bullet lacks a quantifiable result, set needs_metric to true.
- Match each requirement to the most relevant experience bullet.
- If no experience matches a requirement, set matched to false.
${langInstruction}`
      },
      {
        role: 'user',
        content: `${sanitizeUserContent(JSON.stringify(requirements), 'jd_requirements')}

${sanitizeUserContent(JSON.stringify(profile), 'candidate_profile')}

Match the candidate's experiences to the job requirements. For each match, provide a STAR-format enhanced version of the original bullet.`
      }
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'match_experiences',
          description: 'Match candidate experiences to JD requirements with STAR rewrites',
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
                    original_bullet: { type: ['string', 'null'] },
                    star_enhanced: { type: ['string', 'null'] },
                    source_work: { type: ['string', 'null'], description: 'Company + Title' },
                    needs_metric: { type: 'boolean', description: 'True if bullet lacks quantifiable result' }
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
      star_enhanced: string | null
      source_work: string | null
      needs_metric: boolean
    }>
    match_score: { matched: number; total: number; percentage: number }
  }

  // Map to MatchCard format with IDs
  const cards = result.cards.map((card, i) => ({
    id: `card-${i}`,
    requirement: requirements[card.requirement_index] || requirements[0],
    matched: card.matched,
    original_bullet: card.original_bullet,
    star_enhanced: card.star_enhanced,
    source_work: card.source_work,
    status: 'approved' as const,
    edited_text: null
  }))

  return {
    cards,
    match_score: result.match_score
  }
}
