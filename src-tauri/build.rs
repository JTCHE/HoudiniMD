fn main() {
    // `server.rs` embeds `../dist` with `include_dir!`, and a macro leaves no
    // trace for Cargo to watch. Without this line a rebuild after a front-end
    // build keeps the old bundle inside the binary, and Houdini's help pane
    // serves code that no longer exists in the tree.
    println!("cargo:rerun-if-changed=../dist");
    // The app's name lives once, as `productName`. Rust reads it as
    // `crate::APP_NAME`; Vite reads the same field.
    let conf: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string("tauri.conf.json").expect("tauri.conf.json")).expect("JSON");
    println!("cargo:rustc-env=APP_NAME={}", conf["productName"].as_str().expect("productName"));
    tauri_build::build()
}
