// Detuned supersaw pad with two slightly drifting layers.
stack(
  note("<[a3,c4,e4] [f3,a3,c4] [c4,e4,g4] [g3,b3,d4]>")
    .s("sawtooth").detune(0.1).attack(0.4).release(1.5)
    .lpf(sine.range(800, 2200).slow(12)).gain(0.4).room(0.7),
  note("<[a3,c4,e4] [f3,a3,c4] [c4,e4,g4] [g3,b3,d4]>")
    .s("sawtooth").detune(-0.12).attack(0.45).release(1.6)
    .lpf(sine.range(700, 2000).slow(13)).gain(0.35).room(0.7)
).slow(2)
