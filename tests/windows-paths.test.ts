import { describe, expect, test } from "claude-code/testing";
import { directoryOf } from "../hooks/agents-place";
import {
  folderName,
  homeFolder,
  isAbsolutePath,
  isInside,
  relativePath,
  tildePath,
} from "../hooks/paths";

const WIN_HOME = "C:\\Users\\ana";
const WIN_CWD = "C:\\Users\\ana\\Documents\\app";

describe("Windows paths", () => {
  test("W1 the home folder is USERPROFILE when set, else HOME, with an MSYS /c/ path turned into C:/", () => {
    expect(homeFolder(WIN_HOME, "/c/Users/ana")).toBe(WIN_HOME);
    expect(homeFolder(undefined, "/c/Users/ana")).toBe("C:/Users/ana");
    expect(homeFolder(undefined, "/home/ana")).toBe("/home/ana");
    expect(homeFolder(undefined, undefined)).toBeUndefined();
  });

  test("W2 the status line shows a Windows folder under the home as ~/...", () => {
    expect(tildePath(WIN_CWD, WIN_HOME)).toBe("~/Documents/app");
    expect(tildePath(WIN_HOME, WIN_HOME)).toBe("~");
    expect(tildePath("D:\\other", WIN_HOME)).toBe("D:\\other");
    expect(tildePath("/home/ana/app", "/home/ana")).toBe("~/app");
  });

  test("W3 backslash and forward slash forms of one folder count as the same, whatever the drive letter case", () => {
    expect(isInside(WIN_CWD, "C:/Users/ana")).toBe(true);
    expect(isInside("c:\\Users\\ana\\x", WIN_HOME)).toBe(true);
    expect(isInside("C:\\Users\\anabel", WIN_HOME)).toBe(false);
  });

  test("W4 a file under the working folder is shown relative to it", () => {
    expect(relativePath(`${WIN_CWD}\\src\\a.ts`, WIN_CWD)).toBe("src/a.ts");
    expect(relativePath("D:\\x\\a.ts", WIN_CWD)).toBe("D:\\x\\a.ts");
  });

  test("W5 a worktree folder name comes from a Windows path", () => {
    expect(folderName("C:\\work\\vane-signals")).toBe("vane-signals");
    expect(folderName("C:/work/vane-signals")).toBe("vane-signals");
  });

  test("W6 drive paths are absolute", () => {
    expect(isAbsolutePath("C:\\x")).toBe(true);
    expect(isAbsolutePath("C:/x")).toBe(true);
    expect(isAbsolutePath("/x")).toBe(true);
    expect(isAbsolutePath("x\\y")).toBe(false);
  });

  test("W7 an agent's folder comes from a Windows file path or a cd to a drive path", () => {
    expect(directoryOf({ file_path: "C:\\work\\app\\a.ts" })).toBe("C:/work/app");
    expect(directoryOf({ command: 'cd "C:\\My Work\\app" && git status' })).toBe("C:\\My Work\\app");
    expect(directoryOf({ command: "cd /d D:\\app; dir" })).toBe("D:\\app");
    expect(directoryOf({ command: "cd /work/app && ls" })).toBe("/work/app");
    expect(directoryOf({ file_path: "relative\\a.ts" })).toBeUndefined();
  });
});
