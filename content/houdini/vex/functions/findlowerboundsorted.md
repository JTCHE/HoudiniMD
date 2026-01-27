---
breadcrumbs: Houdini 21.0 > VEX > VEX Functions
source: https://www.sidefx.com/docs/houdini/vex/functions/findlowerboundsorted.html
---

# findlowerboundsorted VEX function

> Finds the largest item smaller than a target value in a sorted array.

`int  findlowerboundsorted(<type>array[], <type>target)`

`int  findlowerboundsorted(<type>array[], <type>target, int start)`

`int  findlowerboundsorted(<type>array[], <type>target, int start, int end)`

Returns the position of the first occurrence of the `target` value within the `array`. You can limit the result to the first occurrence at or after a `start` position, and at or before an `end` position.

This function is faster than [findlowerbound(array, target)](https://vexllm.dev/docs/houdini/vex/functions/findlowerbound) when the array is sorted, but will not return the correct result on unsorted arrays.

Returns a negative number if every item in the array range is larger than `target`.