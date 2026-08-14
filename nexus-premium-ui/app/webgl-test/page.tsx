'use client'

import { useEffect, useState } from 'react'

export default function WebGLTestPage() {
  const [gl2, setGl2]          = useState<boolean | null>(null)
  const [gl1, setGl1]          = useState<boolean | null>(null)
  const [exp, setExp]          = useState<boolean | null>(null)
  const [ua,  setUa]           = useState('')

  useEffect(() => {
    const canvas       = document.createElement('canvas')
    const gl2ctx       = canvas.getContext('webgl2')
    const gl1ctx       = canvas.getContext('webgl')
    const experimentalCtx = canvas.getContext('experimental-webgl')

    setGl2(!!gl2ctx)
    setGl1(!!gl1ctx)
    setExp(!!experimentalCtx)
    setUa(navigator.userAgent)
  }, [])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: 'monospace',
      fontSize: 16,
      gap: 12,
    }}>
      <div>WebGL2: {gl2 === null ? '…' : String(gl2)}</div>
      <div>WebGL1: {gl1 === null ? '…' : String(gl1)}</div>
      <div>Experimental WebGL: {exp === null ? '…' : String(exp)}</div>
      <div style={{ maxWidth: 600, textAlign: 'center', fontSize: 12, marginTop: 8 }}>
        User agent: {ua || '…'}
      </div>
    </div>
  )
}
