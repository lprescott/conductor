// Beatless ambient — three slow-evolving layers, no drums.
setcps(60/60/4)

stack(
  // Long-attack pad on Cmaj9 → Em9 → Fmaj9 → Am9
  note("<Cmaj9 Em9 Fmaj9 Am9>")
    .voicing().s("triangle")
    .attack(1.2).release(3)
    .lpf(sine.range(500, 1800).slow(20))
    .room(0.92).roomsize(8).gain(0.45).slow(8),

  // Sparse pentatonic bells, panned by perlin
  note("<e5 g5 ~ b5 ~ d6 ~ a5 ~ ~>")
    .s("sine").attack(0.02).release(1.8)
    .delay(0.7).delaytime(0.66).delayfeedback(0.55)
    .pan(perlin.range(-0.6, 0.6).slow(7))
    .room(0.9).gain(0.32).slow(4),

  // Sub drone — almost subliminal
  note("c1").s("sawtooth")
    .lpf(180).resonance(4)
    .attack(2).release(4).gain(0.5)
)
