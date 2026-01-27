---
breadcrumbs: Houdini 21.0 > VEX > VEX Functions
source: https://www.sidefx.com/docs/houdini/vex/functions/attribdataid.html
---

# attribdataid VEX function

> Returns the data id of a geometry attribute.

`int [] attribdataid(<geometry>geometry, string attribclass, string attribute_name)`

Returns the data id corresponding to an attribute. Data ids can be used for advanced forms of caching. If the data id of an attribute is the same as you've seen before, you can assume the attribute contains the same data it did before. This allows acceleration structures to only be built when necessary.

The length and contents of the array are not defined, and no assumptions should be made about the layout. The result will vary from run to run of Houdini, so only exact equality should be used.

In addition to the normal attribute classes, an additional attribute class of “meta” is supported. This has the additional data ids of

topology

The overall wiring of vertices, points and primitives. This will change if any points are rewired or vertices added.

primitivelist

This data id changes if the contents of the primitive change at all.

detail

This data id tracks the entire geometry as a whole. If it is unchanged, no changes occurred in the geometry.

Show/hide arguments 

`<geometry>`

When running in the context of a node (such as a wrangle SOP), this argument can be an integer representing the input number (starting at 0) to read the geometry from.

Alternatively, the argument can be a string specifying a geometry file (for example, a `.bgeo`) to read from. When running inside Houdini, this can be an `op:/path/to/sop` reference.

``attribclass``

One of `"detail"` (or `"global"`), `"point"`, `"prim"`, or `"vertex"`.

You can also use `"primgroup"`, `"pointgroup"` or `"vertexgroup"` to [read from groups](https://vexllm.dev/docs/houdini/vex/groups).

``attribute_name``

The name of the attribute (or intrinsic) to read.

Returns

An integer array indicating the data id of the attribute.

## Attrib

- [addattrib](https://vexllm.dev/docs/houdini/vex/functions/addattrib)
- [adddetailattrib](https://vexllm.dev/docs/houdini/vex/functions/adddetailattrib)
- [addpointattrib](https://vexllm.dev/docs/houdini/vex/functions/addpointattrib)
- [addprimattrib](https://vexllm.dev/docs/houdini/vex/functions/addprimattrib)
- [addvertexattrib](https://vexllm.dev/docs/houdini/vex/functions/addvertexattrib)
- [addvisualizer](https://vexllm.dev/docs/houdini/vex/functions/addvisualizer)
- [attrib](https://vexllm.dev/docs/houdini/vex/functions/attrib)
- [attribclass](https://vexllm.dev/docs/houdini/vex/functions/attribclass)
- [attribdataid](https://vexllm.dev/docs/houdini/vex/functions/attribdataid)
- [attribsize](https://vexllm.dev/docs/houdini/vex/functions/attribsize)
- [attribtype](https://vexllm.dev/docs/houdini/vex/functions/attribtype)
- [attribtypeinfo](https://vexllm.dev/docs/houdini/vex/functions/attribtypeinfo)
- [detail](https://vexllm.dev/docs/houdini/vex/functions/detail)
- [detailattrib](https://vexllm.dev/docs/houdini/vex/functions/detailattrib)
- [detailattribsize](https://vexllm.dev/docs/houdini/vex/functions/detailattribsize)
- [detailattribtype](https://vexllm.dev/docs/houdini/vex/functions/detailattribtype)
- [detailattribtypeinfo](https://vexllm.dev/docs/houdini/vex/functions/detailattribtypeinfo)
- [detailintrinsic](https://vexllm.dev/docs/houdini/vex/functions/detailintrinsic)
- [findattribval](https://vexllm.dev/docs/houdini/vex/functions/findattribval)
- [findattribvalcount](https://vexllm.dev/docs/houdini/vex/functions/findattribvalcount)
- [getattrib](https://vexllm.dev/docs/houdini/vex/functions/getattrib)
- [getattribute](https://vexllm.dev/docs/houdini/vex/functions/getattribute)
- [hasattrib](https://vexllm.dev/docs/houdini/vex/functions/hasattrib)
- [hasdetailattrib](https://vexllm.dev/docs/houdini/vex/functions/hasdetailattrib)
- [haspointattrib](https://vexllm.dev/docs/houdini/vex/functions/haspointattrib)
- [hasprimattrib](https://vexllm.dev/docs/houdini/vex/functions/hasprimattrib)
- [hasvertexattrib](https://vexllm.dev/docs/houdini/vex/functions/hasvertexattrib)
- [nuniqueval](https://vexllm.dev/docs/houdini/vex/functions/nuniqueval)
- [point](https://vexllm.dev/docs/houdini/vex/functions/point)
- [pointattrib](https://vexllm.dev/docs/houdini/vex/functions/pointattrib)
- [pointattribsize](https://vexllm.dev/docs/houdini/vex/functions/pointattribsize)
- [pointattribtype](https://vexllm.dev/docs/houdini/vex/functions/pointattribtype)
- [pointattribtypeinfo](https://vexllm.dev/docs/houdini/vex/functions/pointattribtypeinfo)
- [pointlocaltransforms](https://vexllm.dev/docs/houdini/vex/functions/pointlocaltransforms)
- [pointtransform](https://vexllm.dev/docs/houdini/vex/functions/pointtransform)
- [pointtransformrigid](https://vexllm.dev/docs/houdini/vex/functions/pointtransformrigid)
- [pointtransforms](https://vexllm.dev/docs/houdini/vex/functions/pointtransforms)
- [pointtransformsrigid](https://vexllm.dev/docs/houdini/vex/functions/pointtransformsrigid)
- [prim](https://vexllm.dev/docs/houdini/vex/functions/prim)
- [prim_attribute](https://vexllm.dev/docs/houdini/vex/functions/prim_attribute)
- [primattrib](https://vexllm.dev/docs/houdini/vex/functions/primattrib)
- [primattribsize](https://vexllm.dev/docs/houdini/vex/functions/primattribsize)
- [primattribtype](https://vexllm.dev/docs/houdini/vex/functions/primattribtype)
- [primattribtypeinfo](https://vexllm.dev/docs/houdini/vex/functions/primattribtypeinfo)
- [priminteriorweights](https://vexllm.dev/docs/houdini/vex/functions/priminteriorweights)
- [primintrinsic](https://vexllm.dev/docs/houdini/vex/functions/primintrinsic)
- [primuv](https://vexllm.dev/docs/houdini/vex/functions/primuv)
- [primuvconvert](https://vexllm.dev/docs/houdini/vex/functions/primuvconvert)
- [removedetailattrib](https://vexllm.dev/docs/houdini/vex/functions/removedetailattrib)
- [removepointattrib](https://vexllm.dev/docs/houdini/vex/functions/removepointattrib)
- [removeprimattrib](https://vexllm.dev/docs/houdini/vex/functions/removeprimattrib)
- [removevertexattrib](https://vexllm.dev/docs/houdini/vex/functions/removevertexattrib)
- [setattrib](https://vexllm.dev/docs/houdini/vex/functions/setattrib)
- [setattribtypeinfo](https://vexllm.dev/docs/houdini/vex/functions/setattribtypeinfo)
- [setdetailattrib](https://vexllm.dev/docs/houdini/vex/functions/setdetailattrib)
- [setpointattrib](https://vexllm.dev/docs/houdini/vex/functions/setpointattrib)
- [setpointlocaltransforms](https://vexllm.dev/docs/houdini/vex/functions/setpointlocaltransforms)
- [setpointtransform](https://vexllm.dev/docs/houdini/vex/functions/setpointtransform)
- [setpointtransforms](https://vexllm.dev/docs/houdini/vex/functions/setpointtransforms)
- [setprimattrib](https://vexllm.dev/docs/houdini/vex/functions/setprimattrib)
- [setvertexattrib](https://vexllm.dev/docs/houdini/vex/functions/setvertexattrib)
- [uniqueval](https://vexllm.dev/docs/houdini/vex/functions/uniqueval)
- [uniquevals](https://vexllm.dev/docs/houdini/vex/functions/uniquevals)
- [uvsample](https://vexllm.dev/docs/houdini/vex/functions/uvsample)
- [vertex](https://vexllm.dev/docs/houdini/vex/functions/vertex)
- [vertexattrib](https://vexllm.dev/docs/houdini/vex/functions/vertexattrib)
- [vertexattribsize](https://vexllm.dev/docs/houdini/vex/functions/vertexattribsize)
- [vertexattribtype](https://vexllm.dev/docs/houdini/vex/functions/vertexattribtype)
- [vertexattribtypeinfo](https://vexllm.dev/docs/houdini/vex/functions/vertexattribtypeinfo)