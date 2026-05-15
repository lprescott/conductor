stack(
  // kick
  sound("bd*4").gain(0.85),

  // snare + occasional flam
  sound("~ sd ~ sd").gain(0.6)
    .every(6, x => x.fast(2).gain(0.45)),

  // hi-hat with groove
  sound("[hh hh] [hh hh*2] [hh hh] [hh hh hh]").gain(0.28)
    .pan("<-0.3 0 0.3 0>"),

  // bass - c minor feel
  note("<c2 c2 ab1 g1>*2").s("piano").lpf(380).gain(0.8),

  // pads - slow chord changes, drift every 3
  note("<[c4,eb4,g4] [ab3,c4,eb4] [eb4,g4,bb4] [g3,bb3,d4]>").s("piano")
    .room(0.7).delay(0.4).gain(0.32).slow(2).lpf(1200)
    .every(3, x => x.rev()),

  // melody with harmonic shadow
  note("<c5 ~ eb5 ~ g4 ~ f5 ~>").s("piano").room(0.5).delay(0.3).gain(0.45)
    .every(4, x => x.fast(2))
    .off(0.125, x => x.up(7).gain(0.2).room(0.8))
)