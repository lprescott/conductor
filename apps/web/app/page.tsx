'use client'

import dynamic from 'next/dynamic'

// <strudel-editor> calls customElements.define on import — cannot run in Node/SSR
const StrudelEditor = dynamic(
  () => import('../components/StrudelEditor').then((m) => ({ default: m.StrudelEditor })),
  { ssr: false }
)

export default function Home() {
  return <StrudelEditor />
}
