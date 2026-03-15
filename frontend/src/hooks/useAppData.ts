'use client'
import { useState, useEffect, useCallback } from 'react'
import type { Topic, HistoryEntry, CalendarEvent, AppSettings, PromptTemplate, Campaign } from '@/types'
import { api } from '@/lib/api'

export function useAppData() {
  const [topics,     setTopics]     = useState<Topic[]>([])
  const [history,    setHistory]    = useState<HistoryEntry[]>([])
  const [calendar,   setCalendar]   = useState<CalendarEvent[]>([])
  const [settings,   setSettingsState] = useState<AppSettings>({ apiKey: '', niche: '', audience: '' })
  const [templates,  setTemplates]  = useState<PromptTemplate[]>([])
  const [campaigns,  setCampaigns]  = useState<Campaign[]>([])
  const [loading,    setLoading]    = useState(true)
  // Substack connection state — global so all components can use it
  const [substackConnected,    setSubstackConnected]    = useState(false)
  const [substackPublication,  setSubstackPublication]  = useState('')

  useEffect(() => {
    Promise.all([
      api<Topic[]>('/api/topics'),
      api<HistoryEntry[]>('/api/history'),
      api<CalendarEvent[]>('/api/calendar'),
      api<AppSettings>('/api/settings'),
      api<PromptTemplate[]>('/api/templates'),
      api<Campaign[]>('/api/campaigns'),
      api<{ connected: boolean; publication: string }>('/api/substack/connect'),
    ]).then(([t, h, c, s, tmpl, camp, sub]) => {
      setTopics(t); setHistory(h); setCalendar(c)
      setSettingsState(s); setTemplates(tmpl); setCampaigns(camp)
      setSubstackConnected(sub.connected)
      setSubstackPublication(sub.publication)
    }).finally(() => setLoading(false))
  }, [])

  // Topics
  const addTopic    = useCallback(async (t: Topic)   => { await api('/api/topics', { method: 'POST',   body: JSON.stringify(t) }); setTopics(p => [t, ...p]) }, [])
  const updateTopic = useCallback(async (t: Topic)   => { await api('/api/topics', { method: 'PUT',    body: JSON.stringify(t) }); setTopics(p => p.map(x => x.id === t.id ? t : x)) }, [])
  const deleteTopic = useCallback(async (id: string) => { await api('/api/topics', { method: 'DELETE', body: JSON.stringify({ id }) }); setTopics(p => p.filter(x => x.id !== id)) }, [])

  // History
  const addHistory    = useCallback(async (e: HistoryEntry) => { await api('/api/history', { method: 'POST',   body: JSON.stringify(e) }); setHistory(p => [e, ...p]) }, [])
  const deleteHistory = useCallback(async (id: string)      => { await api('/api/history', { method: 'DELETE', body: JSON.stringify({ id }) }); setHistory(p => p.filter(x => x.id !== id)) }, [])

  // Calendar
  const addCalEvent    = useCallback(async (e: CalendarEvent) => { await api('/api/calendar', { method: 'POST',   body: JSON.stringify(e) }); setCalendar(p => [...p, e]) }, [])
  const updateCalEvent = useCallback(async (e: CalendarEvent) => { await api('/api/calendar', { method: 'PUT',    body: JSON.stringify(e) }); setCalendar(p => p.map(x => x.id === e.id ? e : x)) }, [])
  const deleteCalEvent = useCallback(async (id: string)       => { await api('/api/calendar', { method: 'DELETE', body: JSON.stringify({ id }) }); setCalendar(p => p.filter(x => x.id !== id)) }, [])

  // Settings
  const saveSettings = useCallback(async (s: AppSettings) => { await api('/api/settings', { method: 'POST', body: JSON.stringify(s) }); setSettingsState(s) }, [])

  // Templates
  const addTemplate    = useCallback(async (t: PromptTemplate) => { await api('/api/templates', { method: 'POST',   body: JSON.stringify(t) }); setTemplates(p => [...p, t]) }, [])
  const updateTemplate = useCallback(async (t: PromptTemplate) => { await api('/api/templates', { method: 'PUT',    body: JSON.stringify(t) }); setTemplates(p => p.map(x => x.id === t.id ? t : x)) }, [])
  const deleteTemplate = useCallback(async (id: string)        => { await api('/api/templates', { method: 'DELETE', body: JSON.stringify({ id }) }); setTemplates(p => p.filter(x => x.id !== id)) }, [])

  // Campaigns
  const addCampaign    = useCallback(async (c: Campaign) => { await api('/api/campaigns', { method: 'POST',   body: JSON.stringify(c) }); setCampaigns(p => [...p, c]) }, [])
  const updateCampaign = useCallback(async (c: Campaign) => { await api('/api/campaigns', { method: 'PUT',    body: JSON.stringify(c) }); setCampaigns(p => p.map(x => x.id === c.id ? c : x)) }, [])
  const deleteCampaign = useCallback(async (id: string)  => { await api('/api/campaigns', { method: 'DELETE', body: JSON.stringify({ id }) }); setCampaigns(p => p.filter(x => x.id !== id)) }, [])

  // Substack
  const refreshSubstackConnection = useCallback(async () => {
    const sub = await api<{ connected: boolean; publication: string }>('/api/substack/connect')
    setSubstackConnected(sub.connected)
    setSubstackPublication(sub.publication)
  }, [])

  return {
    topics, history, calendar, settings, templates, campaigns, loading,
    substackConnected, substackPublication, refreshSubstackConnection,
    addTopic, updateTopic, deleteTopic,
    addHistory, deleteHistory,
    addCalEvent, updateCalEvent, deleteCalEvent,
    saveSettings,
    addTemplate, updateTemplate, deleteTemplate,
    addCampaign, updateCampaign, deleteCampaign,
  }
}
