// Full minimal-techno starter — drop in and edit. 128 bpm.
setcps(128/60/4)

stack(
  s("bd*4").bank("RolandTR909").gain(1.1),
  s("~ cp ~ cp").bank("RolandTR909").gain(0.75),
  s("[~ oh]*2").bank("RolandTR909").gain(0.5),
  s("hh*8").bank("RolandTR909").gain(0.4).pan(sine.range(-0.3, 0.3).slow(3)),

  note("<a1 a1 a1 c2 a1 a1 g1 a1>*8")
    .s("sawtooth")
    .lpf(sine.range(400, 1800).slow(8))
    .lpq(8).gain(0.65),

  note("<a3 ~ ~ c4 ~ e4 ~ g3>")
    .s("square")
    .lpf(perlin.range(600, 2400).slow(4)).lpq(12)
    .delay(0.4).room(0.3).gain(0.45)
)
