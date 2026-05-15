// 909 four-on-the-floor with off-beat open hat. Drop into a stack().
stack(
  s("bd*4").bank("RolandTR909").gain(1.1),
  s("~ cp ~ cp").bank("RolandTR909").gain(0.8),
  s("[~ oh]*2").bank("RolandTR909").gain(0.55),
  s("hh*8").bank("RolandTR909").gain(0.4).pan(sine.range(-0.3, 0.3).slow(3))
)
