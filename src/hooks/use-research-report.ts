import { useState, useCallback, useRef } from 'react'
import type { ReportSSEEvent, AgentStep, ReportCitation } from '../services/api-client'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

export interface ReportState {
  status: 'idle' | 'gathering' | 'generating' | 'complete' | 'error'
  steps: AgentStep[]
  markdown: string
  currentSection: string | null
  citations: ReportCitation[]
  totalDuration: number | null
  error: string | null
}

const INITIAL_STATE: ReportState = {
  status: 'idle',
  steps: [],
  markdown: '',
  currentSection: null,
  citations: [],
  totalDuration: null,
  error: null,
}

export function useResearchReport() {
  const [state, setState] = useState<ReportState>(INITIAL_STATE)
  const abortRef = useRef<AbortController | null>(null)
  // Token buffer for throttled markdown updates
  const tokenBufferRef = useRef('')
  const rafRef = useRef<number | null>(null)

  const flushTokenBuffer = useCallback(() => {
    if (tokenBufferRef.current) {
      const tokens = tokenBufferRef.current
      tokenBufferRef.current = ''
      setState(s => ({ ...s, markdown: s.markdown + tokens }))
    }
    rafRef.current = null
  }, [])

  const generateReport = useCallback(async (indication: string, biomarker: string) => {
    // Cancel any in-progress report
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setState({
      ...INITIAL_STATE,
      status: 'gathering',
    })

    try {
      const params = new URLSearchParams({ indication, biomarker })
      const url = `${API_BASE}/research/report?${params.toString()}`
      const response = await fetch(new URL(url, window.location.origin).toString(), {
        signal: abortRef.current.signal,
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`)
      }

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE events from buffer
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || '' // Keep incomplete event in buffer

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue

          try {
            const event: ReportSSEEvent = JSON.parse(line.slice(6))

            switch (event.type) {
              case 'step': {
                setState(s => {
                  const existingIdx = s.steps.findIndex(st => st.id === event.id)
                  const newSteps = [...s.steps]

                  if (existingIdx >= 0) {
                    newSteps[existingIdx] = {
                      ...newSteps[existingIdx],
                      status: event.status,
                      duration_ms: event.duration_ms,
                      summary: event.summary || newSteps[existingIdx].summary,
                      label: event.label || newSteps[existingIdx].label,
                    }
                  } else {
                    newSteps.push({
                      id: event.id,
                      label: event.label,
                      status: event.status,
                      duration_ms: event.duration_ms,
                      summary: event.summary,
                      startedAt: Date.now(),
                    })
                  }

                  // Switch to 'generating' when LLM starts
                  const newStatus = event.id === 'llm_synthesis' && event.status === 'running'
                    ? 'generating'
                    : s.status

                  return { ...s, steps: newSteps, status: newStatus }
                })
                break
              }

              case 'section_start': {
                setState(s => ({ ...s, currentSection: event.section }))
                break
              }

              case 'token': {
                // Buffer tokens and flush at ~60fps for performance
                tokenBufferRef.current += event.content
                if (!rafRef.current) {
                  rafRef.current = requestAnimationFrame(flushTokenBuffer)
                }
                break
              }

              case 'section_end': {
                // Flush any remaining tokens
                flushTokenBuffer()
                break
              }

              case 'citation': {
                setState(s => ({
                  ...s,
                  citations: [...s.citations, {
                    id: event.id,
                    source: event.source,
                    ref_type: event.ref_type,
                    ref_id: event.ref_id,
                    display: event.display,
                  }]
                }))
                break
              }

              case 'done': {
                // Flush any remaining tokens
                flushTokenBuffer()
                setState(s => ({
                  ...s,
                  status: 'complete',
                  totalDuration: event.total_duration_ms,
                }))
                break
              }

              case 'error': {
                setState(s => ({
                  ...s,
                  status: 'error',
                  error: event.message,
                }))
                break
              }
            }
          } catch {
            // Ignore JSON parse errors for malformed events
          }
        }
      }

      // Final flush
      flushTokenBuffer()

    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setState(s => ({ ...s, status: 'idle' }))
        return
      }
      setState(s => ({
        ...s,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      }))
    }
  }, [flushTokenBuffer])

  const cancelReport = useCallback(() => {
    abortRef.current?.abort()
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    tokenBufferRef.current = ''
    setState(s => ({ ...s, status: 'idle' }))
  }, [])

  const resetReport = useCallback(() => {
    abortRef.current?.abort()
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    tokenBufferRef.current = ''
    setState(INITIAL_STATE)
  }, [])

  return {
    ...state,
    generateReport,
    cancelReport,
    resetReport,
  }
}
