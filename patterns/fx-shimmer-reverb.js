// Big shimmery hall — long room, octave-offset shadow.
// Usage: .room(0.95).roomsize(8).off(0.5, x => x.add(12).gain(0.4))
// Self-playable demo:
note("c4 e4 g4 b4")
  .s("piano")
  .room(0.95).roomsize(8)
  .off(0.5, x => x.add(12).gain(0.4))
  .gain(0.5)
  .slow(2)
