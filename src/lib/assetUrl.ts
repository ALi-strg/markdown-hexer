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

/// The directory a relative image resolves against: the directory holding the
/// Document. A pathless (Untitled) Document has no directory, so nothing is
/// rewritten. Shared by every renderer of a Document — the Preview Pane, the
/// Print Render, and the HTML Export.
export function assetBase(canonicalPath: string | null): string | null {
  if (canonicalPath === null) {
    return null;
  }
  return canonicalPath.replace(/[\\/][^\\/]+$/, "");
}

/// Rewrites relative `<img>` srcs in a rendered host to the scoped `asset://`
/// URLs that resolve against the Document's directory. External srcs (absolute
/// URLs, data URIs, ...) are left untouched.
export function rewriteAssetSrcs(
  host: Element,
  canonicalPath: string | null,
): void {
  const base = assetBase(canonicalPath);
  if (base === null) {
    return;
  }
  for (const img of host.querySelectorAll("img")) {
    const src = img.getAttribute("src");
    if (src === null) {
      continue;
    }
    const absolute = resolveAssetSrc(src, base);
    if (absolute !== null) {
      img.setAttribute("src", toAssetUrl(absolute));
    }
  }
}
