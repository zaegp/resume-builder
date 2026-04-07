import OpenAI from 'openai'
import { sanitizeUserContent } from '@/lib/sanitize'
import type { MatchCard, OutputLanguage } from '@/lib/types'

const client = new OpenAI()

export async function generateCoverLetter(
  confirmedCards: MatchCard[],
  jdText: string,
  language: OutputLanguage
): Promise<string> {
  const approvedCards = confirmedCards.filter(c => c.status !== 'skipped')

  const langInstruction = language === 'zh'
    ? 'Write the cover letter in Chinese (Traditional Chinese / 繁體中文). Keep company names and technical terms in English.'
    : 'Write the cover letter in English.'

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a professional cover letter writer. Write a tailored cover letter based ONLY on the confirmed resume experiences provided. Do not fabricate any details, achievements, or qualifications not present in the source data.

${langInstruction}

Write 3-4 paragraphs: opening (interest + fit), body (2 paragraphs mapping key experiences to role needs), and closing (enthusiasm + call to action). Professional but not generic.`
      },
      {
        role: 'user',
        content: `${sanitizeUserContent(jdText, 'job_description')}

${sanitizeUserContent(JSON.stringify(approvedCards.map(c => ({
  requirement: c.requirement.description,
  experience: c.edited_text || c.star_enhanced || c.original_bullet,
  source: c.source_work
}))), 'confirmed_experiences')}

Write a tailored cover letter for this job based on the confirmed experiences above.`
      }
    ]
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('AI did not return cover letter text')
  }

  return content
}
