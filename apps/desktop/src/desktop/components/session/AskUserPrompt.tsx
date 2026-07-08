import React, { useState, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, Check, ArrowRight, PenTool, ShieldAlert, ClipboardList, HelpCircle, AlertTriangle } from 'lucide-react'

const INTENTS_CONFIG = {
  clarification: {
    title: 'Clarification Request',
    icon: HelpCircle,
    color: 'border-blue-500/20 bg-blue-500/5 text-blue-500',
    btnClass: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  plan_approval: {
    title: 'Plan Approval Required',
    icon: ClipboardList,
    color: 'border-violet-500/20 bg-violet-500/5 text-violet-500',
    btnClass: 'bg-violet-600 hover:bg-violet-700 text-white',
  },
  permission_approval: {
    title: 'Permission Request',
    icon: ShieldAlert,
    color: 'border-orange-500/20 bg-orange-500/5 text-orange-500',
    btnClass: 'bg-orange-600 hover:bg-orange-700 text-white',
  },
  destructive_confirmation: {
    title: 'Destructive Action Warning',
    icon: AlertTriangle,
    color: 'border-red-500/20 bg-red-500/5 text-red-500 animate-pulse',
    btnClass: 'bg-red-600 hover:bg-red-700 text-white',
  }
}

export function AskUserPrompt({ payload, onSubmit }: { payload: any; onSubmit: (ans: string) => void }) {
  const isObj = typeof payload === 'object' && payload !== null && Array.isArray(payload.questions)
  const questions = isObj ? payload.questions : []
  
  const [currentStep, setCurrentStep] = useState(0)
  const [selections, setSelections] = useState<Record<number, string[]>>({})
  const [customAnswers, setCustomAnswers] = useState<Record<number, string>>({})
  const [focusedIndex, setFocusedIndex] = useState(-1)

  useEffect(() => {
    const optsCount = questions[currentStep]?.options?.length || 0
    setFocusedIndex(optsCount > 0 ? 0 : -1)
  }, [currentStep, questions])

  const doSubmit = () => {
    if (!isObj) {
      onSubmit(String(payload))
      return
    }

    const structured = {
      kind: 'choice' as const,
      selected: selections[0] || [],
      customText: customAnswers[0] || '',
      answers: questions.map((q: any, i: number) => ({
        question: q.question,
        selected: selections[i] || [],
        customText: customAnswers[i] || ''
      }))
    }

    onSubmit(JSON.stringify(structured))
  }

  const handleNext = () => {
    if (currentStep < questions.length - 1) {
      setCurrentStep(c => c + 1)
    } else {
      doSubmit()
    }
  }

  const handleSkip = () => {
    handleNext() // skip current question and move to next
  }

  const handleFocusedConfirm = () => {
    const q = questions[currentStep]
    const optsCount = q?.options?.length || 0

    if (focusedIndex >= 0 && focusedIndex < optsCount) {
      const opt = q.options[focusedIndex]
      if (q.is_multi_select) {
        handleToggleOption(currentStep, opt, true)
        return
      }
      handleSelectAndSubmit(opt)
      return
    }

    handleNext()
  }

  const handleSelectAndSubmit = (opt: string) => {
    const updatedSelections = { ...selections, [currentStep]: [opt] }
    setSelections(updatedSelections)

    if (currentStep < questions.length - 1) {
      setCurrentStep(c => c + 1)
    } else {
      const structured = {
        kind: 'choice' as const,
        selected: updatedSelections[0] || [],
        customText: customAnswers[0] || '',
        answers: questions.map((q: any, i: number) => ({
          question: q.question,
          selected: i === currentStep ? [opt] : (updatedSelections[i] || []),
          customText: customAnswers[i] || ''
        }))
      }
      onSubmit(JSON.stringify(structured))
    }
  }

  const handleToggleOption = (qIndex: number, option: string, isMulti: boolean) => {
    setSelections(prev => {
      const current = prev[qIndex] || []
      if (!isMulti) {
        return { ...prev, [qIndex]: [option] }
      }
      if (current.includes(option)) {
        return { ...prev, [qIndex]: current.filter(o => o !== option) }
      } else {
        return { ...prev, [qIndex]: [...current, option] }
      }
    })
  }

  useEffect(() => {
    if (!isObj || !questions[currentStep]) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field (except maybe to catch Enter)
      if (document.activeElement?.tagName === 'INPUT' && e.key !== 'Enter' && e.key !== 'Escape') {
        return
      }

      const q = questions[currentStep]
      const optsCount = q.options?.length || 0

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIndex(i => (i < optsCount - 1 ? i + 1 : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex(i => (i > 0 ? i - 1 : Math.max(0, optsCount - 1)))
      } else if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1
        if (idx >= 0 && idx < optsCount) {
          e.preventDefault()
          if (q.is_multi_select) {
            handleToggleOption(currentStep, q.options[idx], true)
          } else {
            handleSelectAndSubmit(q.options[idx])
          }
        }
      } else if (e.key === ' ' && q.is_multi_select) {
        e.preventDefault()
        if (focusedIndex >= 0 && focusedIndex < optsCount) {
          handleToggleOption(currentStep, q.options[focusedIndex], true)
        }
      } else if (e.key === 'Enter') {
        if (document.activeElement?.tagName === 'INPUT') return
        e.preventDefault()
        handleFocusedConfirm()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleSkip()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentStep, isObj, questions, focusedIndex])


  // Fallback for non-object payload
  if (!isObj) {
    return (
      <div className="mx-4 mb-4 bg-bg-primary border border-border rounded-2xl shadow-sm overflow-hidden animate-fade-in">
        <div className="p-5 space-y-4">
          <p className="text-sm text-text-primary font-medium">{String(payload)}</p>
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const ans = fd.get('answer') as string; if (ans.trim()) onSubmit(ans); }} className="flex items-center gap-2">
            <input type="text" name="answer" placeholder="Type your answer..." className="flex-1 bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:border-accent outline-none transition-colors" autoFocus />
            <button type="submit" className="w-9 h-9 flex items-center justify-center bg-text-primary text-bg-primary rounded-lg hover:opacity-90 transition-opacity">
              <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </div>
    )
  }

  const q = questions[currentStep]
  const currentSelections = selections[currentStep] || []
  const currentCustom = customAnswers[currentStep] || ''

  const intent = payload.intent || 'clarification'
  const intentConfig = INTENTS_CONFIG[intent as keyof typeof INTENTS_CONFIG] || INTENTS_CONFIG.clarification
  const IntentIcon = intentConfig.icon

  return (
    <div className="mx-4 mb-4 bg-bg-primary border border-border rounded-2xl shadow-lg overflow-hidden animate-fade-in text-text-primary w-[min(44rem,calc(100vw-2rem))] max-h-[min(34rem,calc(100vh-8rem))] flex flex-col">
      {/* Intent Header */}
      <div className={`flex items-center gap-2 px-5 py-2.5 border-b border-border/40 ${intentConfig.color} text-xs font-semibold`}>
        <IntentIcon size={14} className="flex-shrink-0" />
        <span>{intentConfig.title}</span>
      </div>

      {/* Header */}
      <div className="p-5 pb-4 flex items-start justify-between gap-4 flex-shrink-0 border-b border-border/60">
        <h3 className="text-[15px] font-medium leading-snug whitespace-pre-wrap break-words max-h-28 overflow-y-auto custom-scrollbar pr-1">{q.question}</h3>
        <div className="flex items-center gap-4 flex-shrink-0 text-text-muted mt-0.5">
          <div className="flex items-center gap-2 text-xs">
            <button 
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
              aria-label="Previous question"
              className="hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-muted transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="tabular-nums">{currentStep + 1} of {questions.length}</span>
            <button 
              onClick={() => setCurrentStep(Math.min(questions.length - 1, currentStep + 1))}
              disabled={currentStep === questions.length - 1}
              aria-label="Next question"
              className="hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-muted transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
          <button onClick={() => onSubmit('Skipped')} aria-label="Close question" className="hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Options List */}
      <div className="px-5 py-4 space-y-2 overflow-y-auto custom-scrollbar flex-1 min-h-0">
        {q.options && q.options.map((opt: string, idx: number) => {
          const isSelected = currentSelections.includes(opt)
          const isFocused = focusedIndex === idx
          
          if (q.is_multi_select) {
            return (
              <button
                key={opt}
                onClick={() => handleToggleOption(currentStep, opt, true)}
                onMouseEnter={() => setFocusedIndex(idx)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border ${
                  isSelected ? 'bg-bg-secondary border-border' : 'bg-bg-tertiary border-transparent hover:bg-bg-secondary'
                } ${isFocused ? 'ring-2 ring-accent border-accent/50 scale-[1.01]' : ''}`}
              >
                <div className={`w-5 h-5 flex flex-shrink-0 items-center justify-center rounded transition-colors ${
                  isSelected ? 'bg-accent border border-accent' : 'border border-border bg-bg-primary'
                }`}>
                  {isSelected && <Check size={14} className="text-white" strokeWidth={3} />}
                </div>
                <span className="text-[14px] leading-snug text-text-primary whitespace-pre-wrap break-words">{opt}</span>
              </button>
            )
          } else {
            // Single select style
            return (
              <button
                key={opt}
                onMouseEnter={() => setFocusedIndex(idx)}
                onClick={() => {
                  handleSelectAndSubmit(opt)
                }}
                className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all border ${
                  isSelected ? 'bg-bg-secondary border-border' : 'bg-bg-tertiary border-transparent hover:bg-bg-secondary'
                } ${isFocused ? 'ring-2 ring-accent border-accent/50 scale-[1.01]' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-[22px] h-[22px] flex-shrink-0 rounded-full bg-bg-primary border border-border flex items-center justify-center text-[11px] font-medium text-text-muted">
                    {isSelected ? <Check size={12} className="text-accent" /> : (idx + 1)}
                  </div>
                  <span className="text-[14px] leading-snug text-text-primary whitespace-pre-wrap break-words min-w-0">{opt}</span>
                </div>
                <ArrowRight size={16} className={`text-text-muted transition-opacity ${isSelected || isFocused ? 'opacity-100 text-accent' : 'opacity-0'}`} />
              </button>
            )
          }
        })}

        {/* Custom Answer Input */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-bg-tertiary border border-transparent focus-within:border-accent focus-within:bg-bg-secondary transition-colors">
          <div className="w-[22px] h-[22px] flex-shrink-0 rounded-full bg-bg-primary border border-border flex items-center justify-center text-text-muted">
            <PenTool size={11} />
          </div>
          <input
            type="text"
            placeholder="Something else"
            value={currentCustom}
            onChange={(e) => setCustomAnswers(prev => ({ ...prev, [currentStep]: e.target.value }))}
            onKeyDown={(e) => {
               if (e.key === 'Enter' && currentCustom.trim()) {
                 e.preventDefault()
                 handleNext()
               }
            }}
            className="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-text-primary placeholder-text-muted"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border flex items-center justify-between flex-shrink-0 bg-bg-primary">
        <div className="text-xs text-text-muted">
          {q.is_multi_select ? `${currentSelections.length} selected` : ''}
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleSkip} 
            className="px-4 py-1.5 border border-border rounded-lg text-sm font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            Skip
          </button>
          <button 
            onClick={handleNext}
            title={currentStep < questions.length - 1 ? 'Next question' : 'Submit answer'}
            className={`w-9 h-9 flex items-center justify-center rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 ${intentConfig.btnClass}`}
          >
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
      
      {/* Footer Hints (Outside card border visually but we put it below here) */}
      <div className="px-5 pb-3 pt-1 text-[11px] text-text-muted/60 flex items-center justify-center gap-2 text-center flex-shrink-0 bg-bg-primary">
        <span>↑↓ to navigate</span>
        <span>·</span>
        <span>Enter to confirm</span>
        <span>·</span>
        <span>Esc to skip</span>
      </div>
    </div>
  )
}
