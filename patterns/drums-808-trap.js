// 808 trap kit: hard kick, snappy clap, hi-hat rolls with velocity.
stack(
  s("bd ~ ~ bd ~ bd ~ ~").bank("RolandTR808").gain(1.0),
  s("~ ~ cp ~ ~ ~ cp ~").bank("RolandTR808").gain(0.85),
  s("hh*16").bank("RolandTR808").gain("0.3 0.5 0.3 0.7 0.3 0.5 0.3 0.6".fast(2)),
  s("~ ~ ~ ~ ~ ~ ~ oh").bank("RolandTR808").gain(0.5)
)
