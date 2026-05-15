// Dub-style ping-pong delay chain — drop onto any pattern to taste.
// Usage: .delay(0.55).delaytime(0.75).delayfeedback(0.7).pan(sine.range(-0.6, 0.6).slow(2)).room(0.5)
// Self-playable demo:
s("rim*2")
  .bank("RolandTR909")
  .delay(0.55)
  .delaytime(0.75)
  .delayfeedback(0.7)
  .pan(sine.range(-0.6, 0.6).slow(2))
  .room(0.5)
  .gain(0.6)
