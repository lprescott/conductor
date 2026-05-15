// Slow-evolving 9th chords with a filter that breathes. Pad/intro material.
note("<Cmaj9 Em9 Fmaj9 Am9>")
  .voicing()
  .s("triangle")
  .attack(0.6).release(2)
  .lpf(sine.range(700, 2400).slow(16))
  .room(0.85)
  .gain(0.45)
  .slow(4)
