## Usage

```vex
float noise(float pos)
float noise(vector pos)
vector noise(vector pos)
float noise(vector4 pos)
```

Returns a smooth value that changes little between near positions. Feed it a position and a scale, and it gives an organic variation: a rough surface, a flicker, a cloud.

The result stays between 0 and 1 and averages about 0.5. To move a point both ways, take away 0.5 first.

## Example

```vex
// A bumpy surface. Run it over points in an Attribute Wrangle.
float freq = 3.0;
float amp = 0.2;
@P += @N * (noise(@P * freq) - 0.5) * amp;
```

> [!NOTE]
>
> Multiply the position to change the size of the features. A larger number gives smaller bumps.

## Related

- [Attribute Wrangle](/nodes/sop/attribwrangle)
- [Scatter](/nodes/sop/scatter)
