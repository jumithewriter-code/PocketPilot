import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { formatNaira } from './engine/format'
import { StoreProvider } from './store'

const saved = () => JSON.parse(localStorage.getItem('pocketpilot.v1')!).data
type User = ReturnType<typeof userEvent.setup>

async function openDemo() {
  const user = userEvent.setup()
  render(
    <StoreProvider>
      <App />
    </StoreProvider>,
  )
  await user.click(screen.getByRole('button', { name: /explore the demo student profile/i }))
  return user
}
const goTo = (user: User, name: string) =>
  user.click(within(screen.getAllByRole('navigation')[0]).getByRole('button', { name }))

describe('demo journey', () => {
  it('opens the labelled synthetic profile without any credentials', async () => {
    await openDemo()
    expect(screen.getByText(/this is a fictional student profile/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /hi ada/i })).toBeInTheDocument()
    expect(screen.getByText('₦24,500')).toBeInTheDocument()
  })

  it('starts from the user own numbers and shows useful empty states', async () => {
    const user = userEvent.setup()
    render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )
    await user.type(screen.getByLabelText(/money you have now/i), '15000')
    await user.click(screen.getByRole('button', { name: /start with my details/i }))
    expect(screen.getByText('₦15,000')).toBeInTheDocument()
    expect(screen.getByText(/nothing recorded yet/i)).toBeInTheDocument()
    await goTo(user, 'Budget')
    expect(screen.getByText(/no income is recorded yet/i)).toBeInTheDocument()
  })

  it('rejects invalid onboarding input', async () => {
    const user = userEvent.setup()
    render(
      <StoreProvider>
        <App />
      </StoreProvider>,
    )
    await user.type(screen.getByLabelText(/money you have now/i), 'lots')
    await user.click(screen.getByRole('button', { name: /start with my details/i }))
    expect(screen.getByText(/enter your balance as a number/i)).toBeInTheDocument()
  })
})

describe('transactions with ML categorisation', () => {
  it('suggests a category, saves it, and updates the data', async () => {
    const user = await openDemo()
    await goTo(user, 'Transactions')
    const before = saved().transactions.length
    await user.click(screen.getByRole('button', { name: /add transaction/i }))
    await user.type(screen.getByLabelText('Description'), 'Bus fare to university')
    await user.type(screen.getByLabelText(/amount/i), '450')
    expect(screen.getByText(/model suggestion: transport/i)).toBeInTheDocument()
    expect(screen.queryByText(/confiden/i)).not.toBeInTheDocument() // no confidence levels are shown to the user
    await user.click(screen.getByRole('button', { name: /^add transaction$/i }))
    expect(saved().transactions).toHaveLength(before + 1)
    const tx = saved().transactions.at(-1)
    expect(tx).toMatchObject({ description: 'Bus fare to university', amount: 450, category: 'Transport', categoryConfirmed: true })
    expect(tx.categoryConfidence).toBeGreaterThan(0)
  })

  it('lets the user correct the prediction, and their choice wins', async () => {
    const user = await openDemo()
    await goTo(user, 'Transactions')
    await user.click(screen.getByRole('button', { name: /add transaction/i }))
    await user.type(screen.getByLabelText('Description'), 'Cinema ticket')
    await user.type(screen.getByLabelText(/amount/i), '3500')
    await user.selectOptions(within(screen.getByRole('form', { name: /add transaction/i })).getByLabelText('Category'), 'Shopping')
    expect(screen.getByText(/you chose/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^add transaction$/i }))
    const tx = saved().transactions.at(-1)
    expect(tx.category).toBe('Shopping')
    expect(tx.categoryConfidence).toBeUndefined()
  })

  it('flags unfamiliar descriptions for review instead of guessing', async () => {
    const user = await openDemo()
    await goTo(user, 'Transactions')
    await user.click(screen.getByRole('button', { name: /add transaction/i }))
    await user.type(screen.getByLabelText('Description'), 'zzzz qqqq')
    expect(screen.getByText(/does not recognise any words/i)).toBeInTheDocument()
  })

  it('validates the form when fields are empty', async () => {
    const user = await openDemo()
    await goTo(user, 'Transactions')
    await user.click(screen.getByRole('button', { name: /add transaction/i }))
    await user.click(screen.getByRole('button', { name: /^add transaction$/i }))
    expect(screen.getByText(/add a short description/i)).toBeInTheDocument()
    expect(screen.getByText(/enter an amount above/i)).toBeInTheDocument()
  })

  it('deletes only after confirmation', async () => {
    const user = await openDemo()
    await goTo(user, 'Transactions')
    const count = saved().transactions.length
    await user.click(screen.getAllByRole('button', { name: /^delete /i })[0])
    expect(saved().transactions).toHaveLength(count)
    await user.click(screen.getByRole('button', { name: /confirm delete/i }))
    expect(saved().transactions).toHaveLength(count - 1)
  })
})

describe('budget', () => {
  it('validates limits and flags an over-budget month', async () => {
    const user = await openDemo()
    await goTo(user, 'Budget')
    const overall = screen.getByLabelText('Overall monthly limit')
    await user.clear(overall)
    await user.type(overall, 'abc{Enter}')
    expect(screen.getByText(/enter a number, 0 or more/i)).toBeInTheDocument()
    await user.clear(overall)
    await user.type(overall, '1000{Enter}')
    expect(saved().budget.overallLimit).toBe(1000)
    expect(screen.getAllByText(/over budget/i).length).toBeGreaterThan(0)
  })

  it('rejects planned expenses dated in the past', async () => {
    const user = await openDemo()
    await goTo(user, 'Budget')
    await user.click(screen.getByRole('button', { name: /add planned expense/i }))
    const form = screen.getByRole('form', { name: /planned expense/i })
    await user.type(within(form).getByLabelText(/name/i), 'Old bill')
    await user.type(within(form).getByLabelText(/amount/i), '500')
    await user.type(within(form).getByLabelText(/date/i), '2020-01-01')
    await user.click(within(form).getByRole('button', { name: 'Add' }))
    expect(within(form).getByText(/use a date after today/i)).toBeInTheDocument()
  })
})

describe('scenario simulator', () => {
  it('does not change the saved plan until changes are accepted', async () => {
    const user = await openDemo()
    await goTo(user, 'Planning')
    const before = saved()
    await user.click(screen.getAllByLabelText(/skip it/i)[0])
    expect(screen.getByRole('button', { name: /reset simulation/i })).toBeEnabled()
    expect(saved()).toEqual(before)

    await user.click(screen.getByRole('button', { name: /review changes to accept/i }))
    await user.click(screen.getByRole('button', { name: /add selected to my plan/i }))
    expect(saved().profile.plannedExpenses).toHaveLength(before.profile.plannedExpenses.length - 1)
  })

  it('reset restores the original forecast', async () => {
    const user = await openDemo()
    await goTo(user, 'Planning')
    await user.click(screen.getAllByLabelText(/skip it/i)[0])
    await user.click(screen.getByRole('button', { name: /reset simulation/i }))
    expect(screen.getByRole('button', { name: /reset simulation/i })).toBeDisabled()
    expect(screen.getByText(/two lines match/i)).toBeInTheDocument()
  })

  it('validates and saves an optional goal, and gives an honest verdict', async () => {
    const user = await openDemo()
    await goTo(user, 'Planning')
    await user.click(screen.getByRole('button', { name: /add a goal/i }))
    await user.click(screen.getByRole('button', { name: /save goal/i }))
    expect(screen.getByText(/say what you are saving for/i)).toBeInTheDocument()
    const form = screen.getByRole('form', { name: 'Goal' })
    await user.type(within(form).getByLabelText(/what for/i), 'Laptop')
    await user.type(within(form).getByLabelText(/target/i), '500000')
    const d = new Date()
    d.setDate(d.getDate() + 30)
    await user.type(within(form).getByLabelText(/want it by/i), d.toISOString().slice(0, 10))
    await user.click(within(form).getByRole('button', { name: /save goal/i }))
    expect(saved().goal).toMatchObject({ description: 'Laptop', targetAmount: 500000 })
    expect(screen.getAllByText(/falls short of the target/i).length).toBeGreaterThan(0)
  })
})

describe('settings', () => {
  it('resets the demo to its original state', async () => {
    const user = await openDemo()
    await goTo(user, 'Transactions')
    await user.click(screen.getAllByRole('button', { name: /^delete /i })[0])
    await user.click(screen.getByRole('button', { name: /confirm delete/i }))
    const changed = saved().transactions.length
    await goTo(user, 'Settings')
    await user.click(screen.getByRole('button', { name: /reset demo to its original state/i }))
    await user.click(screen.getByRole('button', { name: /yes, reset demo/i }))
    expect(saved().transactions.length).toBe(changed + 1)
  })
})

describe('coach UI', () => {
  const stubFetch = (impl: (url?: unknown, init?: { body?: unknown }) => Promise<Response>) => {
    const original = globalThis.fetch
    globalThis.fetch = impl as unknown as typeof fetch
    return () => { globalThis.fetch = original }
  }

  it('shows the built-in explanation, clearly labelled, when the AI is not configured', async () => {
    const restore = stubFetch(async () => new Response(JSON.stringify({ error: 'no_api_key' }), { status: 503 }))
    try {
      const user = await openDemo()
      await goTo(user, 'Insights')
      await user.click(screen.getByRole('button', { name: /^explain my finances$/i }))
      expect(await screen.findByText(/rule-based, not generative AI/i)).toBeInTheDocument()
      expect(screen.getByText(/no API key/i)).toBeInTheDocument()
      expect(screen.getByText(/calculated by PocketPilot/i)).toBeInTheDocument()
      expect(screen.getByText(/not licensed financial advice/i)).toBeInTheDocument()
    } finally { restore() }
  })

  it('keeps the dashboard working when the AI request fails outright', async () => {
    const restore = stubFetch(async () => { throw new TypeError('Failed to fetch') })
    try {
      const user = await openDemo()
      await goTo(user, 'Insights')
      await user.click(screen.getByRole('button', { name: /^explain my finances$/i }))
      expect(await screen.findByText(/could not be reached/i)).toBeInTheDocument()
      await goTo(user, 'Overview')
      expect(screen.getByText('₦24,500')).toBeInTheDocument()
    } finally { restore() }
  })

  it('shows a verified AI answer, and refuses one with invented figures', async () => {
    const good = { summary: 'Your balance is ₦24,500 today.', observations: [], risks: [], recommendations: [], assumptions: [], next_steps: [], questions: [] }
    let body: unknown = { model: 'test-model', response: good }
    const restore = stubFetch(async () => new Response(JSON.stringify(body), { status: 200 }))
    try {
      const user = await openDemo()
      await goTo(user, 'Insights')
      await user.click(screen.getByRole('button', { name: /^explain my finances$/i }))
      expect(await screen.findByText(/AI coach · test-model/)).toBeInTheDocument()
      expect(screen.getByText('Your balance is ₦24,500 today.')).toBeInTheDocument()

      body = { model: 'test-model', response: { ...good, summary: 'You will have ₦987,654 by Friday.' } }
      await user.click(screen.getByRole('button', { name: /^explain my finances$/i }))
      expect(await screen.findByText(/could not verify/i)).toBeInTheDocument()
      expect(screen.queryByText(/987,654/)).not.toBeInTheDocument()
    } finally { restore() }
  })

  it('is a text box, not a dropdown', async () => {
    const user = await openDemo()
    await goTo(user, 'Insights')
    const panel = screen.getByRole('heading', { name: /ask the coach/i }).closest('.card') as HTMLElement
    expect(within(panel).getByRole('textbox', { name: /your question/i })).toBeInTheDocument()
    expect(within(panel).queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('sends the typed question with the facts, submits on Enter, and clears nothing', async () => {
    const bodies: Record<string, unknown>[] = []
    const restore = stubFetch(async (_url?: unknown, init?: { body?: unknown }) => {
      bodies.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify({ error: 'no_api_key' }), { status: 503 })
    })
    try {
      const user = await openDemo()
      await goTo(user, 'Insights')
      const box = screen.getByRole('textbox', { name: /your question/i })
      await user.type(box, 'Why might I run short?{Enter}')
      expect(await screen.findByText(/rule-based, not generative AI/i)).toBeInTheDocument()
      expect(bodies).toHaveLength(1)
      expect(bodies[0].question).toBe('Why might I run short?')
      expect(bodies[0].facts).toBeTruthy()
      expect(box).toHaveValue('Why might I run short?')
      expect(screen.getByText(/you asked: “why might i run short\?”/i)).toBeInTheDocument()
      expect(screen.getByText(/cannot read your question/i)).toBeInTheDocument()
    } finally { restore() }
  })

  it('sends no question when the box is blank, and example chips fill the box', async () => {
    const bodies: Record<string, unknown>[] = []
    const restore = stubFetch(async (_url?: unknown, init?: { body?: unknown }) => {
      bodies.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify({ error: 'no_api_key' }), { status: 503 })
    })
    try {
      const user = await openDemo()
      await goTo(user, 'Insights')
      await user.click(screen.getByRole('button', { name: /^explain my finances$/i }))
      await screen.findByText(/rule-based, not generative AI/i)
      expect('question' in bodies[0]).toBe(false)
      await user.click(screen.getByRole('button', { name: /where is most of my money going/i }))
      expect(screen.getByRole('textbox', { name: /your question/i })).toHaveValue('Where is most of my money going?')
      expect(screen.getByRole('button', { name: /^ask$/i })).toBeInTheDocument()
    } finally { restore() }
  })

  it('limits a question to 300 characters', async () => {
    const user = await openDemo()
    await goTo(user, 'Insights')
    expect(screen.getByRole('textbox', { name: /your question/i })).toHaveAttribute('maxlength', '300')
  })
})

describe('one-off expenses', () => {
  const openForm = async (user: User) => {
    await goTo(user, 'Transactions')
    await user.click(screen.getByRole('button', { name: /add transaction/i }))
    return screen.getByRole('form', { name: /add transaction/i })
  }

  it('saves a marked one-off and tags it in the list', async () => {
    const user = await openDemo()
    const form = await openForm(user)
    await user.type(within(form).getByLabelText('Description'), 'Wedding aso ebi')
    await user.type(within(form).getByLabelText(/amount/i), '15000')
    await user.click(within(form).getByLabelText(/one-off: do not assume/i))
    await user.click(within(form).getByRole('button', { name: /^add transaction$/i }))
    expect(saved().transactions.at(-1)).toMatchObject({ description: 'Wedding aso ebi', amount: 15000, oneOff: true })
    expect(screen.getAllByText('one-off').length).toBeGreaterThan(0)
  })

  it('does not mark anything by default', async () => {
    const user = await openDemo()
    const form = await openForm(user)
    await user.type(within(form).getByLabelText('Description'), 'Lunch at campus cafeteria')
    await user.type(within(form).getByLabelText(/amount/i), '1200')
    await user.click(within(form).getByRole('button', { name: /^add transaction$/i }))
    expect(saved().transactions.at(-1).oneOff).toBeUndefined()
  })

  it('asks when an amount is far above the usual for its category, and the answer ticks the box', async () => {
    const user = await openDemo()
    const form = await openForm(user)
    await user.type(within(form).getByLabelText('Description'), 'Lunch at campus cafeteria')
    await user.type(within(form).getByLabelText(/amount/i), '10000')
    expect(within(form).getByText(/much larger than your usual Food and groceries spending/i)).toBeInTheDocument()
    await user.click(within(form).getByRole('button', { name: /yes, it is a one-off/i }))
    expect(within(form).getByLabelText(/one-off: do not assume/i)).toBeChecked()
    expect(within(form).queryByText(/much larger than your usual/i)).not.toBeInTheDocument()
  })

  it('does not ask for ordinary amounts, and does not offer the option for savings transfers', async () => {
    const user = await openDemo()
    const form = await openForm(user)
    await user.type(within(form).getByLabelText('Description'), 'Lunch at campus cafeteria')
    await user.type(within(form).getByLabelText(/amount/i), '1200')
    expect(within(form).queryByText(/much larger than your usual/i)).not.toBeInTheDocument()
    await user.selectOptions(within(form).getByLabelText('Category'), 'Savings and transfers')
    expect(within(form).queryByLabelText(/one-off: do not assume/i)).not.toBeInTheDocument()
  })

  it('the forecast no longer treats a marked one-off as a habit', async () => {
    const user = await openDemo()
    const endOf = () => /Ends at (-?₦[\d,]+)/.exec(screen.getByRole('img', { name: /projected balance for the next 30 days/i }).getAttribute('aria-label')!)![1]
    const add = async (mark: boolean) => {
      const form = await openForm(user)
      await user.type(within(form).getByLabelText('Description'), 'Wedding aso ebi')
      await user.type(within(form).getByLabelText(/amount/i), '15000')
      await user.selectOptions(within(form).getByLabelText('Category'), 'Shopping')
      if (mark) await user.click(within(form).getByLabelText(/one-off: do not assume/i))
      await user.click(within(form).getByRole('button', { name: /^add transaction$/i }))
      await goTo(user, 'Overview')
      return endOf()
    }
    const marked = await add(true)
    // reset and repeat without marking
    await goTo(user, 'Settings')
    await user.click(screen.getByRole('button', { name: /reset demo to its original state/i }))
    await user.click(screen.getByRole('button', { name: /yes, reset demo/i }))
    const unmarked = await add(false)
    const n = (s: string) => Number(s.replace(/[₦,]/g, ''))
    expect(n(marked)).toBeGreaterThan(n(unmarked)) // marked: pace excludes the ₦15,000
  }, 30_000) // two full add-transaction flows plus a reset: slow under load, not flaky in logic
});

describe('overview custom period', () => {
  const statValue = (label: string) => {
    const card = screen.getByText(label, { selector: '.label' }).closest('.stat') as HTMLElement
    return card.querySelector('.value')!.textContent
  }
  const setDate = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

  it('offers a custom range with From and To dates', async () => {
    const user = await openDemo()
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Period'), 'custom')
    expect(screen.getByLabelText('From')).toBeInTheDocument()
    expect(screen.getByLabelText('To')).toBeInTheDocument()
  })

  it('recomputes money in and spent for exactly the chosen dates', async () => {
    const user = await openDemo()
    const txs = saved().transactions as { date: string; type: string; category: string; amount: number }[]
    const day = [...new Set(txs.filter((t) => t.type === 'expense' && t.category !== 'Savings and transfers').map((t) => t.date))].sort()[10]
    const expected = txs.filter((t) => t.date === day && t.type === 'expense' && t.category !== 'Savings and transfers').reduce((s, t) => s + t.amount, 0)
    await user.selectOptions(screen.getByLabelText('Period'), 'custom')
    setDate(/^From$/, day)
    setDate(/^To$/, day)
    expect(statValue('Spent')).toBe(formatNaira(expected))
    expect(screen.getByText(/^Showing /)).toBeInTheDocument()
  })

  it('explains an invalid range and keeps showing the last 30 days', async () => {
    const user = await openDemo()
    const before = statValue('Spent')
    await user.selectOptions(screen.getByLabelText('Period'), 'custom')
    setDate(/^From$/, '2026-10-10')
    setDate(/^To$/, '2026-10-01')
    expect(screen.getByRole('alert')).toHaveTextContent(/start date must be on or before the end date/i)
    expect(screen.getByRole('alert')).toHaveTextContent(/showing the last 30 days/i)
    expect(statValue('Spent')).toBe(before)
  })
})

describe('coach placement', () => {
  it('is on Insights only, not on Planning', async () => {
    const user = await openDemo()
    await goTo(user, 'Planning')
    expect(screen.queryByRole('heading', { name: /ask the coach/i })).not.toBeInTheDocument()
    await goTo(user, 'Insights')
    expect(screen.getByRole('heading', { name: /ask the coach/i })).toBeInTheDocument()
  })

  it('still knows about a what-if made on Planning when asked from Insights', async () => {
    const bodies: { facts: { scenario: { changes: string[] } | null } }[] = []
    const original = globalThis.fetch
    globalThis.fetch = (async (_u: unknown, init: { body: string }) => {
      bodies.push(JSON.parse(init.body))
      return new Response(JSON.stringify({ error: 'no_api_key' }), { status: 503 })
    }) as unknown as typeof fetch
    try {
      const user = await openDemo()
      await goTo(user, 'Planning')
      await user.click(screen.getAllByLabelText(/skip it/i)[0])
      await goTo(user, 'Insights')
      await user.click(screen.getByRole('button', { name: /^explain my finances$/i }))
      await screen.findByText(/rule-based, not generative AI/i)
      expect(bodies[0].facts.scenario?.changes.join(' ')).toMatch(/Skip planned expense/)
    } finally { globalThis.fetch = original }
  })
})
