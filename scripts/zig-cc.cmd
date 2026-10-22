@echo off
if defined LABYRISPACE_ZIG (
  "%LABYRISPACE_ZIG%" cc -target x86_64-windows-gnu %*
) else if exist "%~dp0..\.local\tools\zig\zig.exe" (
  "%~dp0..\.local\tools\zig\zig.exe" cc -target x86_64-windows-gnu %*
) else (
  zig cc -target x86_64-windows-gnu %*
)
