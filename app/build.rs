fn main() {
    println!("cargo:rerun-if-changed=packaging/icons/128x128.png");
    println!("cargo:rerun-if-changed=packaging/icons/icon.ico");
    println!("cargo:rerun-if-changed=packaging/windows/markdown-hexer.rc");
    embed_resource::compile("packaging/windows/markdown-hexer.rc", embed_resource::NONE)
        .manifest_optional()
        .expect("embed the application icon into the Windows executable");
}
