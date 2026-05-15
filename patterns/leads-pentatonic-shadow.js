// A-minor pentatonic noodle with a 7th-shadow voice trailing 16th behind.
note("<a4 c5 e5 g5 e5 c5 ~ e5>")
  .s("triangle")
  .room(0.6).delay(0.5).gain(0.4)
  .off(0.25, x => x.add(7).gain(0.2))
