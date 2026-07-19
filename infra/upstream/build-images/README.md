# Clean upstream build images

These Dockerfiles define the Linux AMD64 toolchains used to build the frozen
LiveKit components without installing compilers or media headers on the Beelink
host.

- Base images and LiveKit GStreamer images are selected by platform manifest
  digest.
- Debian build packages are selected by exact version. The Aliyun mirror only
  transports signed Debian Bookworm packages for the China-hosted runner.
- The images are build-only inputs. They are not Yujian runtime images and must not
  be published as LiveKit releases.
- The resulting local image IDs, upstream commits, commands, artifact digests,
  and repeated-build comparisons are recorded in
  `docs/acceptance/p1-upstream-evidence.json`.

Flutter uses the official `flutter_linux_3.44.0-stable.tar.xz` archive under the
external `/data` toolchain root, rather than a Docker image, so its large SDK
does not consume the host's shared Docker root.
