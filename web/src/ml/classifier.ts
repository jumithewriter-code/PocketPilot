/**
 * Transaction categoriser: inference for the TF-IDF + logistic-regression model
 * trained in `ml/train.py` (scikit-learn) and exported to `model.json`.
 *
 * The preprocessing and maths mirror scikit-learn exactly (verified against
 * `parity.json` in classifier.test.ts). The model is trained on SYNTHETIC data,
 * so its confidence is a relative signal, not a guarantee of real-world accuracy.
 */
import modelJson from './model.json'
import { CATEGORIES, type Category } from '../engine/types'

interface ModelFile {
  classes: string[]
  intercept: number[]
  /** term -> [idf, weight for each class...] */
  terms: Record<string, number[]>
  lowConfidenceThreshold: number
  validation: { accuracy: number; macroF1: number; nValidation: number; nTrain: number }
}

const model = modelJson as unknown as ModelFile

export const MODEL_INFO = {
  kind: 'TF-IDF + logistic regression (scikit-learn)',
  trainedOn: 'synthetic data',
  validationAccuracy: model.validation.accuracy,
  validationMacroF1: model.validation.macroF1,
  nTrain: model.validation.nTrain,
  nValidation: model.validation.nValidation,
  reviewThreshold: model.lowConfidenceThreshold,
}

export interface Suggestion {
  category: Category
  /** Probability of the top class, 0-1. Rules and unknown inputs report 0. */
  confidence: number
  method: 'model' | 'rules' | 'none'
  /** True when the user should look at this suggestion before trusting it. */
  needsReview: boolean
  alternatives: { category: Category; probability: number }[]
  /** Terms in the description that pushed towards the suggested category. */
  topTerms: { term: string; weight: number }[]
  /** How many words/phrases in the description the model recognised. */
  knownTerms: number
  note?: string
}

/** Mirrors `normalise` in ml/train.py: lowercase, digits removed. */
export function normalise(text: string): string {
  return text.toLowerCase().replace(/\d+/g, ' ')
}

/** Mirrors sklearn's default token pattern: runs of two or more word characters. */
function tokens(text: string): string[] {
  return normalise(text).match(/[\p{L}\p{N}_]{2,}/gu) ?? []
}

function features(text: string): Map<string, number> {
  const toks = tokens(text)
  const grams = [...toks]
  for (let i = 0; i < toks.length - 1; i++) grams.push(`${toks[i]} ${toks[i + 1]}`)
  const tf = new Map<string, number>()
  for (const g of grams) if (model.terms[g]) tf.set(g, (tf.get(g) ?? 0) + 1)
  // sublinear tf x idf, then L2 normalise
  const x = new Map<string, number>()
  let sq = 0
  for (const [term, count] of tf) {
    const v = (1 + Math.log(count)) * model.terms[term][0]
    x.set(term, v)
    sq += v * v
  }
  const norm = Math.sqrt(sq) || 1
  for (const [term, v] of x) x.set(term, v / norm)
  return x
}

/** Class probabilities for a description (same output as sklearn predict_proba). */
export function predictProbs(text: string): { probs: number[]; x: Map<string, number> } {
  const x = features(text)
  const logits = model.intercept.slice()
  for (const [term, v] of x) {
    const w = model.terms[term]
    for (let c = 0; c < logits.length; c++) logits[c] += v * w[c + 1]
  }
  const max = Math.max(...logits)
  const exps = logits.map((l) => Math.exp(l - max))
  const sum = exps.reduce((a, b) => a + b, 0)
  return { probs: exps.map((e) => e / sum), x }
}

const asCategory = (s: string): Category => (CATEGORIES as readonly string[]).includes(s) ? (s as Category) : 'Other'

/** Explicit, labelled fallback used only if the model cannot run. NOT machine learning. */
const RULES: [RegExp, Category][] = [
  [/\b(rice|food|lunch|dinner|suya|bread|grocer|snack|shawarma)\b/i, 'Food and groceries'],
  [/\b(bus|keke|uber|bolt|okada|fare|fuel|taxi|transport)\b/i, 'Transport'],
  [/\b(data|airtime|recharge|mtn|glo|airtel)\b/i, 'Airtime and data'],
  [/\b(fee|textbook|tuition|exam|handout|photocopy|school)\b/i, 'Education and school expenses'],
  [/\b(rent|hostel|electric|token|nepa|light)\b/i, 'Accommodation and utilities'],
  [/\b(pharmacy|clinic|hospital|drug|haircut|salon)\b/i, 'Health and personal care'],
  [/\b(cinema|netflix|party|club|movie|game)\b/i, 'Entertainment and leisure'],
  [/\b(shoe|sneaker|shirt|jumia|dress|bag)\b/i, 'Shopping'],
  [/\b(savings?|piggyvest|cowrywise|own account)\b/i, 'Savings and transfers'],
]

export function rulesFallback(text: string): Suggestion {
  const hit = RULES.find(([re]) => re.test(text))
  return {
    category: hit ? hit[1] : 'Other',
    confidence: 0,
    method: 'rules',
    needsReview: true,
    alternatives: [],
    topTerms: [],
    knownTerms: 0,
    note: 'Keyword rules were used because the model was unavailable. This is not machine learning.',
  }
}

export function classifyDescription(text: string): Suggestion {
  if (!text.trim()) {
    return { category: 'Other', confidence: 0, method: 'none', needsReview: true, alternatives: [], topTerms: [], knownTerms: 0, note: 'Type a description to get a suggestion.' }
  }
  try {
    const { probs, x } = predictProbs(text)
    const ranked = probs
      .map((p, i) => ({ category: asCategory(model.classes[i]), probability: p, i }))
      .sort((a, b) => b.probability - a.probability)
    if (x.size === 0) {
      return {
        category: 'Other',
        confidence: 0,
        method: 'none',
        needsReview: true,
        alternatives: [],
        topTerms: [],
        knownTerms: 0,
        note: 'The model does not recognise any words in this description. Please choose a category.',
      }
    }
    const top = ranked[0]
    const topTerms = [...x.entries()]
      .map(([term, v]) => ({ term, weight: v * model.terms[term][top.i + 1] }))
      .filter((t) => t.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
    const needsReview = top.probability < model.lowConfidenceThreshold
    return {
      category: top.category,
      confidence: top.probability,
      method: 'model',
      needsReview,
      alternatives: ranked.slice(1, 3).map(({ category, probability }) => ({ category, probability })),
      topTerms,
      knownTerms: x.size,
      note: needsReview ? 'Low confidence: please check this category.' : undefined,
    }
  } catch {
    return rulesFallback(text)
  }
}
