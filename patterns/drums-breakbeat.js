// Amen-style breakbeat — chopped, with a ghost snare on the second half.
stack(
  s("bd ~ ~ bd ~ bd ~ ~").bank("RolandTR909").gain(1.0),
  s("~ ~ sd ~ ~ sd ~ sd").bank("RolandTR909").gain(0.75),
  s("hh*16").bank("RolandTR909").gain(0.32).pan(saw.range(-0.4, 0.4).slow(2)),
  s("~ ~ ~ ~ ~ ~ ~ oh").bank("RolandTR909").gain(0.5).hpf(400)
).fast(1.05)
