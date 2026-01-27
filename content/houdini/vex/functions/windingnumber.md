---
breadcrumbs: Houdini 21.0 > VEX > VEX Functions
source: https://www.sidefx.com/docs/houdini/vex/functions/windingnumber.html
---

# windingnumber VEX function

> Computes the winding number of a mesh around a point.

Computes the winding number. The winding number indicates how many times a geometry “wraps around” a point. Useful for inside/outside test, the winding number is approximately one inside of the mesh and approximately zero outside. A point that is half covered by an open surface will have a winding number approximately equal to `0.5`, so this gives a robust way of defining “inside” as having a winding number of `0.5` or greater. Reversed surfaces will have negative winding numbers inside.

`float  windingnumber(<geometry>geometry, vector origin)`

`float  windingnumber(<geometry>geometry, vector origin, float accuracy)`

Computes the winding number of **geometry** around the point **origin**.

`float  windingnumber(<geometry>geometry, string primgroup, vector origin)`

`float  windingnumber(<geometry>geometry, string primgroup, vector origin, float accuracy)`

Computes the winding number of primitive group **primgroup** around the point **origin**.

Show/hide arguments 

`<geometry>`

When running in the context of a node (such as a wrangle SOP), this argument can be an integer representing the input number (starting at 0) to read the geometry from.

Alternatively, the argument can be a string specifying a geometry file (for example, a `.bgeo`) to read from. When running inside Houdini, this can be an `op:/path/to/sop` reference.

`primgroup`

Optionally compute winding number only for a subset of a mesh specified by a primitive group.

`origin`

The position in space to compute winding number.

`accuracy`

The winding number is computed only approximately. The default value 2.0 is sufficient in most situations, setting **accuracy** to 12.0 should yield result accurate up to floating point precision.

Returns

The winding number of geometry at a point.