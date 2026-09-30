## Overview

Scatter drops new points on its input. On a surface, the points land on the faces. On a volume, they fill the inside. The spread is random, but it is the same on every cook until you change the seed.

The points are the start of many setups: the targets for [Copy to Points](/nodes/sop/copytopoints), the seeds of a fracture, the sources of a particle system.

> [!TIP]
>
> Turn on **Relax Iterations** when the points must not clump. The points push each other apart, and the spread looks even without looking like a grid.

## Density

You set how many points there are in two ways. **Total Count** gives an exact number for the whole input. **Density Scale** gives a number for each unit of area, so a bigger surface gets more points.

To put more points in some places than others, paint a float attribute on the input and name it in **Density Attribute**. A value of 0 gets no points. A value of 1 gets the full density.

```vex
// In an Attribute Wrangle above the Scatter:
// more points near the top of the shape.
f@density = fit(@P.y, 0, 2, 0, 1);
```

## Parameters

| Parameter | Description |
| --- | --- |
| Group | The faces to scatter on. Leave it empty to use the whole input. |
| Generate | How the count is set: **By Density** or **Count per Primitive**. |
| Total Count | The number of points, when the count is fixed. |
| Density Scale | Points for each unit of area, when the count comes from the size. |
| Density Attribute | A float attribute that scales the density at each place. |
| Global Seed | Change it to get another random spread with the same count. |
| Relax Iterations | How many times the points push apart. More is more even, and slower. |
| Output Attributes | Keep the face number and the position on the face, to look up the input later. |

## Inputs

**Geometry**\
  The surface or the volume to fill.

## Related

- [Copy to Points](/nodes/sop/copytopoints)
- [Attribute Wrangle](/nodes/sop/attribwrangle)
- [noise](/vex/functions/noise)
