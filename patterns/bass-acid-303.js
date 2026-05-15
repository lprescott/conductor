// 303-style acid line in A minor — resonant filter sweep.
note("<a1 a1 a1 c2 a1 a1 g1 a1>*8")
  .s("sawtooth")
  .lpf(sine.range(400, 1800).slow(8))
  .lpq(12)
  .gain(0.7)
  .distort(0.2)
