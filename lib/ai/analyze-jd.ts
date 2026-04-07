import OpenAI from 'openai'
import { sanitizeUserContent, validateInput } from '@/lib/sanitize'
import type { JDRequirement } from '@/lib/types'

const client = new OpenAI()

export async function analyzeJD(jdText: string): Promise<JDRequirement[]> {
  const text = validateInput(jdText, 10000)
  if (text.length < 50) {
    throw new Error('Job description too short. Paste a full JD for best results.')
  }

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a job description analyst. Extract specific, actionable requirements from the job description. Categorize each requirement.'
      },
      {
        role: 'user',
        content: sanitizeUserContent(text, 'job_description') +
          '\n\nExtract all requirements from this job description.'
      }
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'extract_requirements',
          description: 'Extract structured requirements from a job description',
          parameters: {
            type: 'object',
            properties: {
              requirements: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    category: {
                      type: 'string',
                      enum: ['skills', 'experience', 'qualification', 'responsibility', 'soft_skill']
                    },
                    description: { type: 'string' },
                    keywords: { type: 'array', items: { type: 'string' } }
                  },
                  required: ['category', 'description', 'keywords']
                }
              }
            },
            required: ['requirements']
          }
        }
      }
    ],
    tool_choice: { type: 'function', function: { name: 'extract_requirements' } }
  })

  const toolCall = response.choices[0]?.message?.tool_calls?.[0]
  if (!toolCall || toolCall.type !== 'function' || toolCall.function.name !== 'extract_requirements') {
    throw new Error('AI did not return structured requirements')
  }

  const result = JSON.parse(toolCall.function.arguments) as { requirements: JDRequirement[] }
  return result.requirements || []
}
