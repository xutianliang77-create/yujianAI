import 'package:livekit_client/livekit_client.dart';

class YujianRtcPair {
  final Room primary;
  final Room secondary;

  const YujianRtcPair({required this.primary, required this.secondary});

  Future<void> disconnect() async {
    await Future.wait([
      primary.disconnect(),
      secondary.disconnect(),
    ]);
    await Future.wait([
      primary.dispose(),
      secondary.dispose(),
    ]);
  }
}

Future<Room> connectYujianRtc({
  required String url,
  required String token,
}) async {
  final room = Room(
    roomOptions: const RoomOptions(
      adaptiveStream: true,
      dynacast: true,
    ),
  );
  await room.connect(url, token);
  return room;
}

Future<void> disconnectYujianRtc(Room room) async {
  await room.disconnect();
  await room.dispose();
}

Future<YujianRtcPair> connectYujianRtcPair({
  required String primaryUrl,
  required String primaryToken,
  required String secondaryUrl,
  required String secondaryToken,
}) async {
  final primary = Room(
    roomOptions: const RoomOptions(adaptiveStream: true, dynacast: true),
  );
  final secondary = Room(
    roomOptions: const RoomOptions(adaptiveStream: true, dynacast: true),
  );
  try {
    await Future.wait([
      primary.connect(primaryUrl, primaryToken),
      secondary.connect(secondaryUrl, secondaryToken),
    ]);
    return YujianRtcPair(primary: primary, secondary: secondary);
  } catch (_) {
    await Future.wait([
      primary.disconnect(),
      secondary.disconnect(),
    ]);
    await Future.wait([
      primary.dispose(),
      secondary.dispose(),
    ]);
    rethrow;
  }
}
