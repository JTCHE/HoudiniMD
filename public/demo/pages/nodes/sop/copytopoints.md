One copy of the first input on each point of the second. Each copy reads its point's attributes: set them in an [Attribute Wrangle](/nodes/sop/attribwrangle).

```vex
// On the target points: a random size and turn for each copy.
f@pscale = fit01(rand(@ptnum), 0.6, 1.4);
p@orient = quaternion(rand(@ptnum + 17) * 2 * PI, {0, 1, 0});
```

## Attributes the copies read

| Attribute | What it does to the copy |
| --- | --- |
| `pscale` | Scales the copy evenly. |
| `orient` | A quaternion that turns the copy. |
