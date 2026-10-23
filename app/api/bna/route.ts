
import './globals.css'
'use client'
import './globals.css'
import { useState } from 'react'
export default function BNAEngine() {
  const [input, setInput] = useState('')
  const [engine, setEngine] = useState('AUTO')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const engines = [
    { id: 'AUTO', name: 'تلقائي', icon: '⚡' },
    { id: 'ML', name: 'ذكاء اصطناعي', icon: '🧠' },
    { id: 'NLP', name: 'لغة عراقية', icon: '💬' },
    { id: 'DATA', name: 'بيانات', icon: '📊' },
    { id: 'ANALYTICS', name: 'تحليلات', icon: '📈' },
    { id: 'SEARCH', name: 'بحث', icon: '🔍' },
    { id: 'AUTOMATION', name: 'أتمتة', icon: '⚙️' },
  ]
  async function runBNA() {
    setLoading(true)
    const res = await fetch('/api/bna', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engine, task: 'تحليل', input, dialect: 'عراقية' })
    })
    const data = await res.json()
    setResult(data.result)
    setLoading(false)
  }
  return (
    <div className="min-h-screen bg-black text-white p-4" style={{background: 'radial-gradient(circle at center, #001a33 0%, #000000 100%)'}}>
      <div className="max-w-4xl mx-auto">
        <div className="text-center py-8 border border-[#00D4FF]/30 rounded-2xl bg-[#00D4FF]/5 backdrop-blur-xl shadow-[0_0_50px_rgba(0,212,255,0.3)]">
          <h1 className="text-5xl font-black text-[#00D4FF] drop-shadow-[0_0_20px_#00D4FF]">BNA Engine V3</h1>
          <p className="text-[#00D4FF]/80 mt-2">Build • Navigate • Analyze</p>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-7 gap-2 mt-6">
          {engines.map(e => (
            <button key={e.id} onClick={() => setEngine(e.id)} className={`p-3 rounded-xl border ${engine===e.id ? 'bg-[#00D4FF] text-black border-[#00D4FF]' : 'bg-[#00D4FF]/10 border-[#00D4FF]/30 text-[#00D4FF]'}`}>
              <div className="text-xl">{e.icon}</div><div className="text-xs mt-1 font-bold">{e.name}</div>
            </button>
          ))}
        </div>
        <div className="mt-6 p-4 rounded-2xl bg-[#00D4FF]/5 border border-[#00D4FF]/20">
          <textarea value={input} onChange={e=>setInput(e.target.value)} placeholder="اكتب شي..." className="w-full h-32 bg-black/50 border border-[#00D4FF]/20 rounded-xl p-4 text-white" />
          <button onClick={runBNA} disabled={loading || !input} className="w-full mt-4 py-4 bg-[#00D4FF] text-black font-black rounded-xl shadow-[0_0_30px_#00D4FF]">{loading ? 'جاري...' : 'شغّل BNA 🔵'}</button>
        </div>
        {result && <div className="mt-6 p-6 rounded-2xl bg-[#00D4FF]/5 border border-[#00D4FF]/30"><div className="text-white whitespace-pre-wrap">{result}</div></div>}
      </div>
    </div>
  )
        }
