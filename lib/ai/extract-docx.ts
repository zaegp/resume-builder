import OpenAI from 'openai'
import { sanitizeUserContent, validateInput } from '@/lib/sanitize'
import type { ExtractedProfile } from '@/lib/types'

const client = new OpenAI()

export async function extractFromDocx(rawText: string): Promise<ExtractedProfile> {
  const text = validateInput(rawText, 20000)
  if (text.length < 50) {
    throw new Error('Resume text too short to extract meaningful data')
  }

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a resume parser. Extract structured data from the resume text provided. Be accurate — only include information explicitly stated in the resume. Do not fabricate or embellish any details.'
      },
      {
        role: 'user',
        content: sanitizeUserContent(text, 'resume_text') +
          '\n\nExtract the structured profile data from this resume.'
      }
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'extract_profile',
          description: 'Extract structured profile data from a resume',
          parameters: {
            type: 'object',
            properties: {
              work: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    company: { type: 'string' },
                    title: { type: 'string' },
                    start_date: { type: 'string' },
                    end_date: { type: ['string', 'null'] },
                    bullets: { type: 'array', items: { type: 'string' } }
                  },
                  required: ['company', 'title', 'start_date', 'bullets']
                }
              },
              skills: { type: 'array', items: { type: 'string' } },
              projects: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    tech: { type: 'array', items: { type: 'string' } },
                    outcomes: { type: 'string' }
                  },
                  required: ['name', 'description']
                }
              },
              education: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    school: { type: 'string' },
                    degree: { type: 'string' },
                    start_date: { type: 'string' },
                    end_date: { type: 'string' }
                  },
                  required: ['school', 'degree']
                }
              }
            },
            required: ['work', 'skills', 'projects', 'education']
          }
        }
      }
    ],
    tool_choice: { type: 'function', function: { name: 'extract_profile' } }
  })

  const toolCall = response.choices[0]?.message?.tool_calls?.[0]
  if (!toolCall || toolCall.type !== 'function' || toolCall.function.name !== 'extract_profile') {
    throw new Error('AI did not return structured profile data')
  }

  const profile = JSON.parse(toolCall.function.arguments) as ExtractedProfile

  if (!profile.work || profile.work.length === 0) {
    throw new Error('No work experience found in resume. Please add at least one work entry.')
  }

  return {
    work: profile.work || [],
    skills: profile.skills || [],
    projects: profile.projects || [],
    education: profile.education || []
  }
}
