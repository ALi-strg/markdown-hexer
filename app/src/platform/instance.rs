//! Single-instance handoff over a local socket.
//!
//! The first process binds a per-user socket and forwards every later launch's
//! paths to it. No TCP port is opened. Unix sockets are created with mode 0600;
//! on Windows the default named-pipe DACL limits connections to the current
//! user, SYSTEM, and administrators, and remote clients are rejected.

use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

use interprocess::local_socket::prelude::*;
use interprocess::local_socket::{GenericFilePath, ListenerOptions};

const MAGIC: &[u8; 4] = b"MHX2";
const MAX_PATHS: usize = 256;
const MAX_PATH_BYTES: usize = 64 * 1024;
const MAX_MESSAGE_BYTES: usize = 8 * 1024 * 1024;
const RETRIES: usize = 40;
const RETRY_DELAY: Duration = Duration::from_millis(50);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InstanceRequest {
    pub paths: Vec<PathBuf>,
    pub focus: bool,
}

/// The running instance's receiver. Dropping it does not stop the accept
/// thread; the process is the lifetime boundary.
type Wake = Arc<Mutex<Option<Box<dyn Fn() + Send + Sync>>>>;

pub struct InstanceServer {
    rx: Receiver<InstanceRequest>,
    wake: Wake,
    _thread: Option<JoinHandle<()>>,
}

impl InstanceServer {
    pub fn try_recv(&self) -> Option<InstanceRequest> {
        self.rx.try_recv().ok()
    }

    /// Ask the UI to repaint when a launch arrives, so an idle window reacts
    /// without polling.
    pub fn set_wake(&self, wake: impl Fn() + Send + Sync + 'static) {
        if let Ok(mut slot) = self.wake.lock() {
            *slot = Some(Box::new(wake));
        }
    }

    pub(crate) fn from_receiver(rx: Receiver<InstanceRequest>) -> Self {
        Self {
            rx,
            wake: Arc::new(Mutex::new(None)),
            _thread: None,
        }
    }
}

pub enum Acquire {
    Primary {
        server: InstanceServer,
        warning: Option<String>,
    },
    /// Paths were delivered to the running instance; this process exits.
    Forwarded,
}

/// Bind or forward. Retries cover the race where a just-started primary has not
/// begun accepting yet.
pub fn acquire(paths: Vec<PathBuf>) -> Acquire {
    acquire_at(default_name(), paths)
}

fn acquire_at(name: PathBuf, paths: Vec<PathBuf>) -> Acquire {
    let request = InstanceRequest { paths, focus: true };
    let mut last_error = None;

    for _ in 0..RETRIES {
        if send_request(&name, &request).is_ok() {
            return Acquire::Forwarded;
        }

        match bind(&name) {
            Ok(listener) => {
                return Acquire::Primary {
                    server: serve(listener),
                    warning: None,
                };
            }
            Err(error) => {
                last_error = Some(error);
                // A Unix socket left behind by a crashed process refuses
                // connections but blocks bind. Only remove it after a second
                // failed connect proves no live primary owns it.
                #[cfg(unix)]
                if error.kind() == io::ErrorKind::AddrInUse
                    && send_request(&name, &request).is_err()
                {
                    let _ = std::fs::remove_file(&name);
                }
            }
        }

        std::thread::sleep(RETRY_DELAY);
    }

    // Never turn a transient IPC failure into a launch failure: run without a
    // receiver and report it. A later launch can still start its own primary.
    Acquire::Primary {
        server: InstanceServer::from_receiver(mpsc::channel().1),
        warning: Some(format!(
            "single-instance handoff unavailable: {}",
            last_error
                .map(|error| error.to_string())
                .unwrap_or_else(|| "unknown error".to_owned())
        )),
    }
}

fn bind(name: &Path) -> io::Result<LocalSocketListener> {
    let name = name.to_fs_name::<GenericFilePath>()?;
    let options = ListenerOptions::new().name(name);
    // Filesystem Unix sockets need an explicit owner-only mode. Windows named
    // pipes use the default DACL, which already excludes other users.
    #[cfg(unix)]
    let options = {
        use interprocess::os::unix::local_socket::ListenerOptionsExt;
        options.mode(0o600)
    };
    options.create_sync()
}

fn serve(listener: LocalSocketListener) -> InstanceServer {
    let (tx, rx) = mpsc::channel();
    let wake: Wake = Arc::new(Mutex::new(None));
    let thread_wake = Arc::clone(&wake);
    let thread = std::thread::Builder::new()
        .name("markdown-hexer-ipc".to_owned())
        .spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else {
                    continue;
                };
                match read_request(&mut stream) {
                    Ok(request) => {
                        if tx.send(request).is_err() {
                            break;
                        }
                        if let Ok(slot) = thread_wake.lock()
                            && let Some(wake) = slot.as_ref()
                        {
                            wake();
                        }
                    }
                    Err(error) => eprintln!("markdown-hexer: bad IPC request: {error}"),
                }
            }
        })
        .expect("spawn IPC thread");

    InstanceServer {
        rx,
        wake,
        _thread: Some(thread),
    }
}

fn send_request(name: &Path, request: &InstanceRequest) -> io::Result<()> {
    let name = name.to_fs_name::<GenericFilePath>()?;
    let mut stream = LocalSocketStream::connect(name)?;
    #[cfg(windows)]
    allow_foreground();
    let bytes = encode(request)?;
    stream.write_all(&bytes)?;
    stream.flush()
}

/// The secondary process may raise the primary's window even though it is not
/// the foreground process itself.
#[cfg(windows)]
fn allow_foreground() {
    const ASFW_ANY: u32 = u32::MAX;
    // SAFETY: a plain Win32 call with a constant argument.
    unsafe {
        AllowSetForegroundWindow(ASFW_ANY);
    }
}

#[cfg(windows)]
#[link(name = "user32")]
unsafe extern "system" {
    fn AllowSetForegroundWindow(dw_process_id: u32) -> i32;
}

fn encode(request: &InstanceRequest) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(MAGIC);
    bytes.push(u8::from(request.focus));
    let count = u32::try_from(request.paths.len())
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "too many paths"))?;
    if request.paths.len() > MAX_PATHS {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "too many paths",
        ));
    }
    bytes.extend_from_slice(&count.to_le_bytes());
    for path in &request.paths {
        let encoded = encode_path(path);
        if encoded.len() > MAX_PATH_BYTES {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "path too long"));
        }
        let length = u32::try_from(encoded.len())
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "path too long"))?;
        bytes.extend_from_slice(&length.to_le_bytes());
        bytes.extend_from_slice(&encoded);
    }
    if bytes.len() > MAX_MESSAGE_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "request too large",
        ));
    }
    Ok(bytes)
}

fn read_request(stream: &mut LocalSocketStream) -> io::Result<InstanceRequest> {
    let mut magic = [0_u8; 4];
    stream.read_exact(&mut magic)?;
    if &magic != MAGIC {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "unknown IPC request",
        ));
    }
    let mut focus = [0_u8; 1];
    stream.read_exact(&mut focus)?;
    let mut count = [0_u8; 4];
    stream.read_exact(&mut count)?;
    let count = u32::from_le_bytes(count) as usize;
    if count > MAX_PATHS {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "too many paths"));
    }

    let mut paths = Vec::with_capacity(count);
    let mut total = 0_usize;
    for _ in 0..count {
        let mut length = [0_u8; 4];
        stream.read_exact(&mut length)?;
        let length = u32::from_le_bytes(length) as usize;
        total = total.saturating_add(length);
        if length > MAX_PATH_BYTES || total > MAX_MESSAGE_BYTES {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "path too long"));
        }
        let mut encoded = vec![0_u8; length];
        stream.read_exact(&mut encoded)?;
        paths.push(decode_path(&encoded));
    }

    Ok(InstanceRequest {
        paths,
        focus: focus[0] != 0,
    })
}

#[cfg(unix)]
fn encode_path(path: &Path) -> Vec<u8> {
    use std::os::unix::ffi::OsStrExt;
    path.as_os_str().as_bytes().to_vec()
}

#[cfg(unix)]
fn decode_path(bytes: &[u8]) -> PathBuf {
    use std::os::unix::ffi::OsStringExt;
    PathBuf::from(std::ffi::OsString::from_vec(bytes.to_vec()))
}

#[cfg(windows)]
fn encode_path(path: &Path) -> Vec<u8> {
    use std::os::windows::ffi::OsStrExt;
    path.as_os_str()
        .encode_wide()
        .flat_map(u16::to_le_bytes)
        .collect()
}

#[cfg(windows)]
fn decode_path(bytes: &[u8]) -> PathBuf {
    use std::os::windows::ffi::OsStringExt;
    let wide = bytes
        .as_chunks::<2>()
        .0
        .iter()
        .map(|[lo, hi]| u16::from_le_bytes([*lo, *hi]))
        .collect::<Vec<_>>();
    PathBuf::from(std::ffi::OsString::from_wide(&wide))
}

#[cfg(windows)]
fn default_name() -> PathBuf {
    let user = std::env::var("USERNAME").unwrap_or_else(|_| "user".to_owned());
    let domain = std::env::var("USERDOMAIN").unwrap_or_default();
    let mut suffix: String = format!("{domain}-{user}")
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
        .collect();
    suffix.truncate(80);
    PathBuf::from(format!(r"\\.\pipe\markdown-hexer-2.0-{suffix}"))
}

#[cfg(unix)]
fn default_name() -> PathBuf {
    let uid = unsafe { libc::geteuid() };
    let dir = std::env::var_os("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(std::env::temp_dir);
    dir.join(format!("markdown-hexer-2.0-{uid}.sock"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_name() -> PathBuf {
        use std::sync::atomic::{AtomicU32, Ordering};
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        let id = COUNTER.fetch_add(1, Ordering::Relaxed);
        if cfg!(windows) {
            PathBuf::from(format!(
                r"\\.\pipe\markdown-hexer-test-{}-{id}",
                std::process::id()
            ))
        } else {
            std::env::temp_dir().join(format!(
                "markdown-hexer-test-{}-{id}.sock",
                std::process::id()
            ))
        }
    }

    #[test]
    fn paths_round_trip_through_the_protocol() {
        let request = InstanceRequest {
            paths: vec![
                PathBuf::from("/docs/notes.md"),
                PathBuf::from("/docs/other file.markdown"),
            ],
            focus: true,
        };

        let bytes = encode(&request).unwrap();
        let mut cursor = io::Cursor::new(bytes);
        let mut magic = [0_u8; 4];
        cursor.read_exact(&mut magic).unwrap();
        assert_eq!(&magic, MAGIC);
        let mut focus = [0_u8; 1];
        cursor.read_exact(&mut focus).unwrap();
        assert_eq!(focus[0], 1);
        let mut count = [0_u8; 4];
        cursor.read_exact(&mut count).unwrap();
        assert_eq!(u32::from_le_bytes(count), 2);
        for path in &request.paths {
            let mut length = [0_u8; 4];
            cursor.read_exact(&mut length).unwrap();
            let mut encoded = vec![0_u8; u32::from_le_bytes(length) as usize];
            cursor.read_exact(&mut encoded).unwrap();
            assert_eq!(&decode_path(&encoded), path);
        }
    }

    #[test]
    fn an_empty_request_is_just_a_focus_ping() {
        let bytes = encode(&InstanceRequest {
            paths: Vec::new(),
            focus: true,
        })
        .unwrap();
        assert_eq!(&bytes[..5], b"MHX2\x01");
    }

    #[test]
    fn a_second_launch_forwards_its_paths_and_primary_receives_them() {
        let name = unique_name();
        let primary = match acquire_at(name.clone(), Vec::new()) {
            Acquire::Primary { server, warning } => {
                assert!(warning.is_none());
                server
            }
            Acquire::Forwarded => panic!("first launch must become primary"),
        };

        let forwarded = acquire_at(
            name,
            vec![
                PathBuf::from("/docs/first.md"),
                PathBuf::from("/docs/second.md"),
            ],
        );
        assert!(matches!(forwarded, Acquire::Forwarded));

        let request = primary
            .rx
            .recv_timeout(Duration::from_secs(5))
            .expect("primary receives the handoff");
        assert!(request.focus);
        assert_eq!(
            request.paths,
            vec![
                PathBuf::from("/docs/first.md"),
                PathBuf::from("/docs/second.md")
            ]
        );
    }

    #[test]
    fn ui_receiver_can_be_injected() {
        let (tx, rx) = mpsc::channel();
        let server = InstanceServer::from_receiver(rx);
        tx.send(InstanceRequest {
            paths: vec![PathBuf::from("notes.md")],
            focus: true,
        })
        .unwrap();
        assert_eq!(
            server.try_recv().unwrap().paths,
            vec![PathBuf::from("notes.md")]
        );
        assert!(server.try_recv().is_none());
    }
}
