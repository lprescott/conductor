import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: ['@strudel/repl', '@strudel/webaudio'],
}

export default config
