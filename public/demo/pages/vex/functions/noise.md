## Usage

```vex
float noise(vector pos)
vector noise(vector pos)
```

A smooth value that changes little between near positions: a rough surface, a flicker, a cloud. It stays between 0 and 1, about 0.5 on average.

## Example

```vex
@P += @N * (noise(@P * 3) - 0.5) * 0.2;
```
