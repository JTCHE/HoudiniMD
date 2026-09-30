Attribute Wrangle runs a few lines of VEX on each point, face or vertex, in parallel. Read and write an attribute by its type and name, such as `@P` or `f@pscale`.

```vex
// Push each point out along its normal, by a noise value.
@P += @N * noise(@P * 4) * chf("amount");
```

> [!TIP]
>
> The button beside the code makes a slider for each `chf()` call.

## Run over

Points, primitives, vertices, or the whole geometry once.
