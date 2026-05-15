// Conductor demo — open with the Conductor custom editor, hit Play.
stack(
  // kick on every beat
  sound("bd*4").gain(0.9),

  // snare on 2 & 4 with a ghost roll every 8 bars
  sound("~ sd ~ sd").gain(0.65)
    .every(8, x => x.fast(2).gain(0.45)),

  // hats with a little swing
  sound("hh*8").gain(0.3)
    .pan(sine.range(-0.4, 0.4).slow(4)),

  // sub bass — A minor → F → C → G
  note("<a1 a1 f1 f1 c2 c2 g1 g1>").s("sawtooth")
    .lpf(perlin.range(200, 700).slow(8))
    .resonance(8).gain(0.7),

  // chord pad
  note("<[a3,c4,e4] [f3,a3,c4] [c4,e4,g4] [g3,b3,d4]>").s("piano")
    .room(0.8).delay(0.35).gain(0.35).slow(2)
    .lpf(sine.range(800, 2400).slow(16)),

  // lead — pentatonic noodle, drops out every 3rd bar
  note("<a4 c5 e5 g5 e5 c5 ~ e5>").s("triangle")
    .room(0.6).delay(0.5).gain(0.4)
    .every(3, x => x.silence)
    .off(0.25, x => x.up(7).gain(0.18))
).cpm(85)