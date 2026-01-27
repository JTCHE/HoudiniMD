---
breadcrumbs: Houdini 21.0 > VEX > VEX Functions
source: https://www.sidefx.com/docs/houdini/vex/functions/append.html
---

# append VEX function

> Adds an item to an array or string.

`void  append(string &array, string value)`

Appends the second string to the first.

`void  append(<type>&array[], <type>value)`

Appends the given value to the end of the array. Increases the size of `array` by 1. This is the same as [push(array, value)](https://vexllm.netlify.app/docs/houdini/vex/functions/push).

`void  append(<type>&array[], <type>values[])`

Concatenates the values from the `values` array to the end of `array`. Increases the size of `array` by `len(values)`. This is the same as [push(array, values)](https://vexllm.netlify.app/docs/houdini/vex/functions/push).

Tip

You can set an individual item in an array using `array[n] = x`.