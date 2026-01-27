---
breadcrumbs: Houdini 19.5 > Networks and parameters
source: https://www.sidefx.com/docs/houdini19.5/network/nodes.html
---

# Network editor

> How to create, move, copy, and edit nodes.

See also [how to navigate around the network](https://undefined/docs/houdini19.5/network/navigate), [how to wire nodes together](https://undefined/docs/houdini19.5/network/wire), and [how to organize nodes](https://undefined/docs/houdini19.5/network/organize).

## Viewing

See [navigating networks](https://undefined/docs/houdini19.5/network/navigate).

## Adding nodes

To...

Do this

Create a new node

1.  In the network editor, press ⇥ Tab to open a menu of available node types.
    
2.  Start typing the name of a node and press Enter, or use the menu items to select a node type.
    
3.  Click in the network editor to place the new node.
    

Tip

You can drop the node on a [wire](https://undefined/docs/houdini19.5/network/wire) to automatically insert it between the wire’s input and output.

Create a new node attached to an existing input/output

-   To branch a new wire off an input or output connector, click the connector to start a wire, then press ⇥ Tab and use the menu to choose which type of node to create and press Enter.
    
-   To insert a new node just before a connected input, or just after an output, RMB\-click the connector and use the menu to choose the type of node to insert.
    
-   You can press ⇥ Tab, choose the node type, and then while placing the node, you can drag from a connector to wire the node and place it at the same time.
    
-   You can press ⇥ Tab, choose the node type, and then press ⇧ Shift + Enter to automatically wire the new node into the output of the “current” node (the node shown in the parameter editor, usually the most-recently selected node).
    

Create a quick copy of a node

Hold Alt and drag the node to drag out a copy.

## Working with nodes

To...

Do this

Select a node

-   Click the “body” of the node (not including the [flags](https://undefined/docs/houdini19.5/network/flags)).
    
-   You can hold S to enter a “select-only” mode. While you hold the key down, clicking and dragging will only select. This makes it easy to select nodes without worrying about moving the node or accidentally clicking wires, flags, or other UI.
    

Connect nodes together

See [wiring nodes](https://undefined/docs/houdini19.5/network/wire).

Delete a node

Select the node and choose **Edit ▸ Delete** or press ⌦ Del.

When you delete a node, the network tries to fix itself by connecting all the descendants of the deleted node to the node’s first parent.

Move a node

-   Drag the node.
    
-   To move the node and all downstream nodes at the same time, hold ⇧ Shift and drag.
    
-   To move the node and all upstream nodes at the same time, hold ⌃ Ctrl and drag.
    

Cut, copy, and paste one or more nodes

-   Select the nodes.
    
-   Right-click a selected node and choose **Cut**, **Copy**, or **Paste**.
    
    or
    
-   Use the **Edit** menu or use the standard hotkeys.
    

See also [copies and references](https://undefined/docs/houdini19.5/network/copying).

Show a context menu of commands related to a node

-   Press RMB on the node.
    
-   You can also press RMB on the name of a node in the path shown at the top of a pane to get that node’s context menu.
    

Rename a node

Click the name next to the node to make it editable.

Delete nodes

Select the nodes and press ⌦ Del.

Display detailed information about a node

See [node info window](https://undefined/docs/houdini19.5/network/nodes#info) below.

## Node ring

Hovering over a node pops up a “ring” around the node with access to the node’s [flags](https://undefined/docs/houdini19.5/network/flags) and a button to open the [node info window](https://undefined/docs/houdini19.5/network/nodes#info). This makes it easy to interact with flags when you're zoomed out so far the flag indicators on the node are too tiny to click.

Clicking the flags in the ring is the same as clicking the flag areas on the node. For example, you can use the same keyboard modifiers to separate the [display and render](https://undefined/docs/houdini19.5/network/flags#sop) flags in a geometry network.

Tip

Hold CTRL to temporarily fade the ring when you want to point to a node the ring is obscuring.

You can turn off the node ring or change the zoom level at which it appears in the [network editor options](https://undefined/docs/houdini19.5/network/options).

## Node info window

You can get statistics and information about a particular node in the *info window*. For example, the info window for geometry nodes shows the number of points, primitives, and vertices, as well as the groups and attributes in the node’s geometry. This is often very useful for figuring out what’s going on.

To...

Do this

Show the info window temporarily to quickly check some information

Hold MMB on the node. When you release the mouse button, the window automatically closes.

Open a transitory window that closes when it loses focus

-   Hover over the node and click the button in the ring.
    
    or
    
-   ⌃ Ctrl + MMB click the node.
    
    or
    
-   Right-click the node and choose **Show node information**.
    

As soon as the info window loses focus (for example, you click somewhere outside the window), it closes. This lets you check the information and interact with the controls in the window while not distracting too much.

Linux

On Linux, the default is for the info window to persist even if it loses focus, requiring you to close the window manually. This is because some Linux users turn on a “focus follows mouse” preference, making the info window lose focus immediately and close. If you don’t have “focus follows mouse” on in your window manager, you can turn on

Keep the info window open persistently

Click the ![](../icons/NETVIEW/pin_out.svg) pin icon in the info window. You can click the pin icon again to “unpin” and close the window.

Keep the information in the window updated

-   If you turn on the **Keep updated** checkbox is on, the information in the window will automatically update if the network recooks. This can make playback or interactive updates slow as the info window is redrawn on every cook.
    
-   When **Keep updated** is off, if the information in the window is potentially outdated (because the node cooked), the window turns gray and the Refresh button highlights yellow.
    
-   You can click the ![](../icons/NETVIEW/reload_needsupdate.svg) Refresh button in the info window to update the information.
    

Show any extra information in the info window

Click the ![](../icons/NETVIEW/verbose.svg) Verbose button in the info window.

Note that not all nodes or types of information have any extra information to show. Sometimes “extra information” may simply expand abbreviations, or make no change at all.

-   You can set a preference so an unpinned info window always requires manually closing, instead of disappearing when it loses focus. In the main menus, choose **Edit ▸ Preferences ▸ Network editor** and turn off **Node info windows close when losing focus**.
    
-   You can use ⇧ Shift + MMB to view the info window without cooking the node.
    

## Tips

-   You can copy and paste between multiple running instances of Houdini. To make each running copy of Houdini have a separate clipboard, use the `SESI_COPY_SUFFIX` environment variable.