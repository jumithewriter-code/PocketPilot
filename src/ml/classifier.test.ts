import { describe, expect, it } from 'vitest'
import { classifyDescription, MODEL_INFO, predictProbs, rulesFallback } from './classifier'
import parity from './parity.json'

describe('TypeScript inference matches scikit-learn', () => {
  for (const c of parity.cases) {
    it(`predict_proba parity for ${JSON.stringify(c.text)}`, () => {
      const { probs } = predictProbs(c.text)
      probs.forEach((p, i) => expect(p).toBeCloseTo(c.probs[i], 4))
    })
  }
})

describe('classifyDescription', () => {
  it('categorises the demo examples from the brief', () => {
    expect(classifyDescription('Lunch at campus cafeteria').category).toBe('Food and groceries')
    expect(classifyDescription('Bus fare to university').category).toBe('Transport')
    expect(classifyDescription('Mobile data subscription').category).toBe('Airtime and data')
    expect(classifyDescription('Course registration fee').category).toBe('Education and school expenses')
    expect(classifyDescription('Cinema ticket').category).toBe('Entertainment and leisure')
  })

  it('reports a confidence and the words behind it', () => {
    const s = classifyDescription('Lunch at campus cafeteria')
    expect(s.method).toBe('model')
    expect(s.confidence).toBeGreaterThan(0)
    expect(s.confidence).toBeLessThanOrEqual(1)
    expect(s.topTerms.length).toBeGreaterThan(0)
    expect(s.alternatives).toHaveLength(2)
  })

  it('flags unfamiliar descriptions instead of guessing confidently', () => {
    const s = classifyDescription('zzzz qqqq')
    expect(s.method).toBe('none')
    expect(s.needsReview).toBe(true)
    expect(s.category).toBe('Other')
    expect(classifyDescription('').method).toBe('none')
  })

  it('ignores amounts when classifying', () => {
    expect(classifyDescription('Cinema ticket 3500').category).toBe(classifyDescription('Cinema ticket').category)
  })

  it('keeps the rules fallback explicitly labelled as not ML', () => {
    const s = rulesFallback('bus fare')
    expect(s.method).toBe('rules')
    expect(s.category).toBe('Transport')
    expect(s.note).toMatch(/not machine learning/i)
  })

  it('exposes honest model info', () => {
    expect(MODEL_INFO.trainedOn).toBe('synthetic data')
    expect(MODEL_INFO.validationAccuracy).toBeGreaterThan(0)
  })
})
