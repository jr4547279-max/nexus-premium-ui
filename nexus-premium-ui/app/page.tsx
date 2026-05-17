'use client'

import { NexusApp } from '@/components/nexus'

export default function Home() {
  return (
    <>
      <NexusApp />
      <button
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 2147483647,
          pointerEvents: "auto",
          padding: "16px 20px",
          background: "red",
          color: "white"
        }}
        onClick={() => alert("FLOATING BUTTON WORKS")}
      >
        TEST TAP
      </button>
    </>
  )
}
