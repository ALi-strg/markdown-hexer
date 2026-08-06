import { convertFileSrc } from "@tauri-apps/api/core";

/// True when a src cannot be resolved against the Document's directory: it is
/// empty, root-relative, protocol-relative, or carries a scheme (`http:`,
/// `https:`, `data:`, `asset:`, `mailto:`, ...).
export function isExternalSrc(src: string): boolean {
  return (
    src === "" ||
    src.startsWith("/") ||
    /^[a-z][a-z0-9+.-]*:/i.test(src)
  );
}

/// Resolves a relative image src against the Document's directory to an
/// absolute filesystem path. Returns `null` for external srcs that must be left
/// untouched. The Rust `asset://` protocol re-checks the result stays inside the
/// Document's directory, so a crafted `../` cannot read sibling files.
export function resolveAssetSrc(src: string, baseDir: string): string | null {
  if (isExternalSrc(src)) {
    return null;
  }
  const dir = baseDir.replace(/[\\/]+$/, "");
  const separator = dir.includes("\\") ? "\\" : "/";
  return `${dir}${separator}${src.replace(/\//g, separator)}`;
}

/// Converts an absolute filesystem path into the webview URL served by the
/// scoped `asset://` protocol.
export function toAssetUrl(absolutePath: string): string {
  return convertFileSrc(absolutePath);
}
