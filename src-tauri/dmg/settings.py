# The window of the disk image, for dmgbuild (build.sh passes `app` and
# `background`). Positions are icon centres, in points, from the top left of
# the window's content. background.png is drawn to the same grid, and is
# taller than the content, so no title bar height leaves a strip under it.
import os.path

app = defines["app"]
name = os.path.basename(app)

files = [app]
symlinks = {"Applications": "/Applications"}
icon = os.path.join(app, "Contents", "Resources", "icon.icns")

format = "ULFO"
window_rect = ((200, 160), (720, 472))
background = defines["background"]
icon_size = 160
text_size = 13
icon_locations = {name: (190, 210), "Applications": (530, 210)}

default_view = "icon-view"
show_status_bar = False
show_tab_view = False
show_toolbar = False
show_pathbar = False
show_sidebar = False
