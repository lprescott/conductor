// Sub bass — perlin-modulated LPF for organic movement, four-bar progression.
note("<a1 a1 f1 f1 c2 c2 g1 g1>")
  .s("sawtooth")
  .lpf(perlin.range(200, 700).slow(8))
  .resonance(8)
  .gain(0.7)
