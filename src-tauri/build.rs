fn main() {
    // `server.rs` embeds `../dist` with `include_dir!`, and a macro leaves no
    // trace for Cargo to watch. Without this line a rebuild after a front-end
    // build keeps the old bundle inside the binary, and Houdini's help pane
    // serves code that no longer exists in the tree.
    println!("cargo:rerun-if-changed=../dist");
    tauri_build::build()
}
