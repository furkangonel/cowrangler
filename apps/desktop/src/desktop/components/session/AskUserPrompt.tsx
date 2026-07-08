import React, { useState, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, Check, ArrowRight, PenTool } from 'lucide-react'

export function AskUserPrompt({ payload, onSubmit }: { payload: any; onSubmit: (ans: string) => void }) {
  const isObj = typeof payload === 'object' && payload !== null && Array.isArray(payload.questions)
  const questions = isObj ? payload.questions : []
  
  const [currentStep, setCurrentStep] = useState(0)
  const [selections, setSelections] = useState<Record<number, string[]>>({})
  const [customAnswers, setCustomAnswers] = useState<Record<number, string>>({})
  const [focusedIndex, setFocusedIndex] = useState(-1)

  useEffect(() => {
    setFocusedIndex(-1)
  }, [currentStep])

  const doSubmit = () => {
    if (!isObj) {
      onSubmit(String(payload))
      return
    }

    let finalAnswer = ""
    questions.forEach((q: any, i: number) => {
      const selectedOpts = selections[i] || []
      const custom = customAnswers[i]?.trim()
      
      if (selectedOpts.length > 0 || custom) {
        finalAnswer += `Q: ${q.question}\n`
        if (selectedOpts.length > 0) {
          finalAnswer += `A: ${selectedOpts.join(', ')}\n`
        }
        if (custom) {
          finalAnswer += `A (Custom): ${custom}\n`
        }
        finalAnswer += '\n'
      }
    })

    if (finalAnswer.trim()) {
      onSubmit(finalAnswer.trim())
    } else {
      onSubmit("Skipped")
    }
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

  const handleSelectAndSubmit = (opt: string) => {
    const updatedSelections = { ...selections, [currentStep]: [opt] }
    setSelections(updatedSelections)

    if (currentStep < questions.length - 1) {
      setCurrentStep(c => c + 1)
    } else {
      let finalAnswer = ""
      questions.forEach((q: any, i: number) => {
        const selectedOpts = i === currentStep ? [opt] : (updatedSelections[i] || [])
        const custom = customAnswers[i]?.trim()
        
        if (selectedOpts.length > 0 || custom) {
          finalAnswer += `Q: ${q.question}\n`
          if (selectedOpts.length > 0) {
            finalAnswer += `A: ${selectedOpts.join(', ')}\n`
          }
          if (custom) {
            finalAnswer += `A (Custom): ${custom}\n`
          }
          finalAnswer += '\n'
        }
      })

      if (finalAnswer.trim()) {
        onSubmit(finalAnswer.trim())
      } else {
        onSubmit("Skipped")
      }
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
        setFocusedIndex(i => (i < optsCount - 1 ? i + 1 : i))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex(i => (i > 0 ? i - 1 : 0))
      } else if (e.key === 'Enter') {
        if (document.activeElement?.tagName === 'INPUT') return // Let input handlers deal with it
        e.preventDefault()
        if (focusedIndex >= 0 && focusedIndex < optsCount) {
          const opt = q.options[focusedIndex]
          handleToggleOption(currentStep, opt, !!q.is_multi_select)
        } else {
          // If no option focused, try to advance/submit
          handleNext()
        }
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

  return (
    <div className="mx-4 mb-4 bg-bg-primary border border-border rounded-2xl shadow-lg overflow-hidden animate-fade-in text-text-primary max-w-2xl">
      {/* Header */}
      <div className="p-5 pb-4 flex items-start justify-between gap-4">
        <h3 className="text-[15px] font-medium leading-snug">{q.question}</h3>
        <div className="flex items-center gap-4 flex-shrink-0 text-text-muted mt-0.5">
          <div className="flex items-center gap-2 text-xs">
            <button 
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
              className="hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-muted transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="tabular-nums">{currentStep + 1} of {questions.length}</span>
            <button 
              onClick={() => setCurrentStep(Math.min(questions.length - 1, currentStep + 1))}
              disabled={currentStep === questions.length - 1}
              className="hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-muted transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
          <button onClick={() => onSubmit('Skipped')} className="hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Options List */}
      <div className="px-5 space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar pb-4">
        {q.options && q.options.map((opt: string, idx: number) => {
          const isSelected = currentSelections.includes(opt)
          const isFocused = focusedIndex === idx
          
          if (q.is_multi_select) {
            return (
              <button
                key={opt}
                onClick={() => handleToggleOption(currentStep, opt, true)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border ${
                  isSelected ? 'bg-bg-secondary border-border' : 'bg-bg-tertiary border-transparent hover:bg-bg-secondary'
                } ${isFocused ? 'ring-2 ring-accent border-accent/50 scale-[1.01]' : ''}`}
              >
                <div className={`w-5 h-5 flex flex-shrink-0 items-center justify-center rounded transition-colors ${
                  isSelected ? 'bg-accent border border-accent' : 'border border-border bg-bg-primary'
                }`}>
                  {isSelected && <Check size={14} className="text-white" strokeWidth={3} />}
                </div>
                <span className="text-[14px] leading-tight text-text-primary">{opt}</span>
              </button>
            )
          } else {
            // Single select style
            return (
              <button
                key={opt}
                onClick={() => {
                  handleSelectAndSubmit(opt)
                }}
                className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all border ${
                  isSelected ? 'bg-bg-secondary border-border' : 'bg-bg-tertiary border-transparent hover:bg-bg-secondary'
                } ${isFocused ? 'ring-2 ring-accent border-accent/50 scale-[1.01]' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-[22px] h-[22px] flex-shrink-0 rounded-full bg-bg-primary border border-border flex items-center justify-center text-[11px] font-medium text-text-muted">
                    {isSelected ? <Check size={12} className="text-accent" /> : (idx + 1)}
                  </div>
                  <span className="text-[14px] leading-tight text-text-primary">{opt}</span>
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
               if (e.key === 'Enter' && currentCustom.trim()) handleNext()
            }}
            className="flex-1 bg-transparent outline-none text-[14px] text-text-primary placeholder-text-muted"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border flex items-center justify-between">
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
            className="w-9 h-9 flex items-center justify-center bg-text-primary text-bg-primary rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
      
      {/* Footer Hints (Outside card border visually but we put it below here) */}
      <div className="px-5 pb-3 pt-1 text-[11px] text-text-muted/60 flex items-center justify-center gap-2 text-center">
        <span>↑↓ to navigate</span>
        <span>·</span>
        <span>Enter to select</span>
        <span>·</span>
        <span>Esc to skip</span>
      </div>
    </div>
  )
}
