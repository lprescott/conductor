// Swung boom-bap: dusty kick on 1 and the "and" of 3, snare on 2 and 4.
stack(
  s("bd ~ ~ bd ~ ~ bd ~").bank("RolandTR909").gain(0.95).lpf(2200),
  s("~ ~ sd ~ ~ ~ sd ~").bank("RolandTR909").gain(0.7).lpf(3500).room(0.25),
  s("hh*8").bank("RolandTR909").gain(0.28).lpf(6000),
  s("~ ~ ~ ~ ~ ~ ~ rim").bank("RolandTR909").gain(0.35).delay(0.15)
).swing(2)
