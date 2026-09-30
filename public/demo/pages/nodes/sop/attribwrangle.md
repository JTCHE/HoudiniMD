## Overview

Attribute Wrangle runs a short VEX program on the geometry that comes in. The program runs once for each element, in parallel, so a few lines can change millions of points.

Read an attribute with its type and name, such as `@P` or `f@pscale`. Write to it the same way. An attribute that does not exist yet is made for you.

```vex
// Push each point out along its normal, by a noise value.
float amount = chf("amount");
@P += @N * noise(@P * 4) * amount;
```

> [!TIP]
>
> Press the button beside the code to make a slider for each `chf()` and `chi()` call. Then change the value without editing the code.

## Run over

The wrangle runs over one kind of element at a time.

| Run Over | The code runs once for each |
| --- | --- |
| Points | point. `@ptnum` is its number. |
| Primitives | face, curve or volume. `@primnum` is its number. |
| Vertices | corner of a face. |
| Detail | whole geometry, once. Use it to set a value that all the points read. |

## Common attributes

| Attribute | Type | Meaning |
| --- | --- | --- |
| `@P` | vector | The position. |
| `@N` | vector | The normal. |
| `@Cd` | vector | The colour. |
| `@ptnum` | int | The number of this point. |
| `@numpt` | int | The number of points in the geometry. |
| `@Frame` | float | The current frame. |

## Parameters

| Parameter | Description |
| --- | --- |
| Group | The elements to run on. Leave it empty to run on all of them. |
| Run Over | Points, primitives, vertices or detail. |
| VEXpression | The code. |

## Related

- [noise](/vex/functions/noise)
- [Scatter](/nodes/sop/scatter)
- [Copy to Points](/nodes/sop/copytopoints)
