const DRIVE_PREFIX = /^([a-z]):/;
const DRIVE_ABSOLUTE = /^[A-Za-z]:[\\/]/;
const MSYS_DRIVE = /^\/([a-zA-Z])(\/|$)/;

export function slashPath(path: string): string {
  return path.replace(/\\/g, "/").replace(DRIVE_PREFIX, (_, drive: string) => `${drive.toUpperCase()}:`);
}

export function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || DRIVE_ABSOLUTE.test(path);
}

export function homeFolder(
  userProfile: string | undefined,
  home: string | undefined,
): string | undefined {
  if (userProfile) return userProfile;
  const msys = home === undefined ? null : MSYS_DRIVE.exec(home);
  if (!msys || home === undefined) return home;
  return `${(msys[1] ?? "").toUpperCase()}:/${home.slice(msys[0].length)}`;
}

export function isInside(path: string, root: string): boolean {
  const [inner, outer] = [slashPath(path), trimmedRoot(root)];
  return inner === outer || inner.startsWith(`${outer}/`);
}

export function folderName(path: string): string {
  const slashed = slashPath(path);
  return slashed.slice(slashed.lastIndexOf("/") + 1);
}

export function parentFolder(path: string): string {
  const slashed = slashPath(path);
  return slashed.slice(0, slashed.lastIndexOf("/"));
}

export function relativePath(path: string, cwd: string): string {
  const [slashed, root] = [slashPath(path), trimmedRoot(cwd)];
  return root !== "" && slashed.startsWith(`${root}/`) ? slashed.slice(root.length + 1) : path;
}

export function tildePath(path: string, home: string | undefined): string {
  const [slashed, root] = [slashPath(path), trimmedRoot(home ?? "")];
  return root !== "" && isInside(slashed, root) ? `~${slashed.slice(root.length)}` : path;
}

function trimmedRoot(path: string): string {
  return slashPath(path).replace(/\/+$/, "");
}
