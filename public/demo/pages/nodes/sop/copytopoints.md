## Overview

Copy to Points takes the geometry on its first input and puts one copy of it on each point of its second input. It is how a forest grows from one tree, or a crowd of rocks from one rock.

Each copy reads the attributes of its point. Give the points a scale, a direction and a colour, and every copy comes out different.

## Attributes the copies read

| Attribute | What it does to the copy |
| --- | --- |
| `pscale` | Scales the copy evenly. |
| `scale` | Scales the copy on each axis. |
| `N` and `up` | Point the copy's Z axis along `N`, with `up` as its Y axis. |
| `orient` | A quaternion that turns the copy. It wins over `N` and `up`. |
| `Cd` | Colours the copy, when **Copy Attributes** is on. |

> [!NOTE]
>
> Set the attributes on the points, not on the copies. An [Attribute Wrangle](/nodes/sop/attribwrangle) on the target points is the usual place.

```vex
// On the target points: a random size and a random turn for each copy.
f@pscale = fit01(rand(@ptnum), 0.6, 1.4);
float angle = rand(@ptnum + 17) * 2 * PI;
p@orient = quaternion(angle, {0, 1, 0});
```

## Parameters

| Parameter | Description |
| --- | --- |
| Source Group | The part of the first input to copy. |
| Target Points | The points to copy onto. Leave it empty to use all of them. |
| Pack and Instance | Copy a light reference instead of the full geometry. Much faster for many copies. |
| Piece Attribute | Copy a different piece to each point, matched by the value of this attribute. |
| Copy Attributes | Carry the point attributes over to the copies. |

## Inputs

**Geometry to Copy**\
  The shape to copy.

**Target Points**\
  One copy lands on each of these points.

## Related

- [Scatter](/nodes/sop/scatter)
- [Box](/nodes/sop/box)
- [Attribute Wrangle](/nodes/sop/attribwrangle)
