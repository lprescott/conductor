// @strudel/webaudio ships no TypeScript declarations
declare module '@strudel/webaudio' {
  export function initAudioOnFirstClick(): void
  export function getAudioContext(): AudioContext
}

// Register <strudel-editor> as a known JSX element
declare namespace React {
  namespace JSX {
    interface IntrinsicElements {
      'strudel-editor': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        suppressHydrationWarning?: boolean
      }
    }
  }
}
