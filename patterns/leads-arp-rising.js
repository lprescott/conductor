// Eighth-note arpeggio rising across a four-chord loop, with octave doubling.
note("<[a3 c4 e4 a4] [f3 a3 c4 f4] [c4 e4 g4 c5] [g3 b3 d4 g4]>*2")
  .s("square")
  .lpf(perlin.range(800, 3000).slow(8))
  .lpq(6)
  .delay(0.4).delaytime(0.375).delayfeedback(0.45)
  .gain(0.4)
  .off(0.125, x => x.add(12).gain(0.25))
